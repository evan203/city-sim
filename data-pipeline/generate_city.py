import osmnx as ox
import json
import os
import networkx as nx
from shapely.ops import unary_union
from shapely.geometry import Polygon, MultiPolygon
import re

# ==========================================
# 1. Configuration
# ==========================================
PLACE_NAME = "Wisconsin State Capitol, Madison, USA"
DIST = 3000

# Road width settings (meters)
LANE_WIDTH_DEFAULT = 3.5
DEFAULT_WIDTHS = {
    "motorway": 12,
    "trunk": 11,
    "primary": 10,
    "secondary": 9,
    "tertiary": 8,
    "residential": 6,
    "service": 4,
    "unclassified": 5,
    "cycleway": 2,
    "footway": 1.5,
    "path": 1.5,
}


# ==========================================
# 2. Helpers
# ==========================================
def get_height(row):
    """Estimates building height."""
    h = 8.0
    if "height" in row and str(row["height"]).lower() != "nan":
        try:
            clean = "".join(
                filter(lambda x: x.isdigit() or x == ".", str(row["height"]))
            )
            h = float(clean)
        except:
            pass
    elif "building:levels" in row and str(row["building:levels"]).lower() != "nan":
        try:
            clean = "".join(
                filter(lambda x: x.isdigit() or x == ".", str(row["building:levels"]))
            )
            h = float(clean) * 3.5
        except:
            pass
    return round(h, 1)


def estimate_road_width(row):
    """Estimates width with US-unit safety checks."""
    # 1. Explicit width tag
    for key in ["width", "width:carriageway", "est_width"]:
        if key in row and str(row[key]) != "nan":
            val_str = str(row[key]).lower()
            try:
                nums = re.findall(r"[-+]?\d*\.\d+|\d+", val_str)
                if nums:
                    val = float(nums[0])
                    if "'" in val_str or "ft" in val_str or "feet" in val_str:
                        val *= 0.3048
                    elif val > 50:  # Sanity check for feet without units
                        val *= 0.3048
                    return val
            except:
                pass

    # 2. Lanes
    if "lanes" in row and str(row["lanes"]) != "nan":
        try:
            clean = re.findall(r"\d+", str(row["lanes"]))
            if clean:
                lanes = int(clean[0])
                lanes = max(1, min(lanes, 6))
                return lanes * LANE_WIDTH_DEFAULT
        except:
            pass

    # 3. Default based on type
    highway = row.get("highway", "residential")
    if isinstance(highway, list):
        highway = highway[0]
    return DEFAULT_WIDTHS.get(highway, 4.0)


def parse_geometry(geom, center_x, center_y):
    """Parses geometry into {outer, holes} structure."""
    if geom.is_empty:
        return []

    polys = []
    if geom.geom_type == "Polygon":
        source_geoms = [geom]
    elif geom.geom_type == "MultiPolygon":
        source_geoms = geom.geoms
    else:
        return []

    for poly in source_geoms:
        outer = [
            [round(x - center_x, 2), round(y - center_y, 2)]
            for x, y in poly.exterior.coords
        ]
        holes = []
        for interior in poly.interiors:
            hole_coords = [
                [round(x - center_x, 2), round(y - center_y, 2)]
                for x, y in interior.coords
            ]
            holes.append(hole_coords)
        polys.append({"outer": outer, "holes": holes})

    return polys


def parse_line_points(geom, center_x, center_y):
    """Simple parser for LineStrings (Routing Graph)."""
    if geom.geom_type == "LineString":
        return [
            [round(x - center_x, 2), round(y - center_y, 2)] for x, y in geom.coords
        ]
    return []


# ==========================================
# 3. Execution
# ==========================================
print(f"1. Downloading Data for: {PLACE_NAME}...")

tags_visual = {
    "building": True,
    "natural": ["water", "bay"],
    "leisure": ["park", "garden"],
    "landuse": ["grass", "forest", "park"],
}
gdf_visual = ox.features.features_from_address(PLACE_NAME, tags=tags_visual, dist=DIST)

print("   Downloading Road Graph...")
G = ox.graph.graph_from_address(PLACE_NAME, dist=DIST, network_type="drive")
gdf_nodes, gdf_edges = ox.graph_to_gdfs(G)

print("2. Projecting Coordinates...")
utm_crs = gdf_visual.estimate_utm_crs()
gdf_visual = gdf_visual.to_crs(utm_crs)
gdf_edges = gdf_edges.to_crs(utm_crs)
gdf_nodes = gdf_nodes.to_crs(utm_crs)

center_x = gdf_visual.geometry.centroid.x.mean()
center_y = gdf_visual.geometry.centroid.y.mean()

output_visual = {"buildings": [], "water": [], "parks": [], "roads": []}
output_routing = {"nodes": {}, "edges": []}

print("3. Processing Visual Layers...")
for idx, row in gdf_visual.iterrows():
    polygons = parse_geometry(row.geometry, center_x, center_y)

    for poly_data in polygons:
        # 1. Buildings
        if "building" in row and str(row["building"]) != "nan":
            output_visual["buildings"].append(
                {"shape": poly_data, "height": get_height(row)}
            )

        # 2. Water (Explicit check for NaN)
        elif ("natural" in row and str(row["natural"]) != "nan") or (
            "water" in row and str(row["water"]) != "nan"
        ):
            output_visual["water"].append({"shape": poly_data})

        # 3. Parks (Fallback)
        else:
            output_visual["parks"].append({"shape": poly_data})

print("   Buffering roads...")
road_polys = []
for idx, row in gdf_edges.iterrows():
    width = estimate_road_width(row)
    buffered = row.geometry.buffer(width / 2, cap_style=2, join_style=2)
    road_polys.append(buffered)

if road_polys:
    print("   Merging road polygons...")
    merged_roads = unary_union(road_polys)
    road_shapes = parse_geometry(merged_roads, center_x, center_y)
    for shape in road_shapes:
        output_visual["roads"].append({"shape": shape})

print("4. Processing Routing Graph...")
for node_id, row in gdf_nodes.iterrows():
    output_routing["nodes"][int(node_id)] = {
        "x": round(row.geometry.x - center_x, 2),
        "y": round(row.geometry.y - center_y, 2),
    }

for u, v, k in G.edges(keys=True):
    try:
        row = gdf_edges.loc[(u, v, k)]
        if isinstance(row, (type(gdf_edges),)):
            row = row.iloc[0]
    except KeyError:
        continue

    output_routing["edges"].append(
        {
            "u": int(u),
            "v": int(v),
            "oneway": bool(row.get("oneway", False)),
            "points": parse_line_points(row.geometry, center_x, center_y),
        }
    )

out_dir = os.path.join(os.path.dirname(__file__), "../public")
os.makedirs(out_dir, exist_ok=True)
with open(os.path.join(out_dir, "city_data.json"), "w") as f:
    json.dump(output_visual, f)
with open(os.path.join(out_dir, "routing_graph.json"), "w") as f:
    json.dump(output_routing, f)
print(f"Done! Exported to {out_dir}")
