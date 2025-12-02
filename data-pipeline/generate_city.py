import osmnx as ox
import json
import os
import networkx as nx
from shapely.ops import unary_union
from shapely.geometry import Polygon, MultiPolygon
from scipy.spatial import cKDTree
import re
import numpy as np

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


# Census/Zoning Simulation Settings
# Approximate density per cubic meter of building volume
POP_DENSITY_FACTOR = 0.05  # People per m3 (Residential)
JOB_DENSITY_FACTOR = 0.08  # Jobs per m3 (Commercial)


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
    for key in ["width", "width:carriageway", "est_width"]:
        if key in row and str(row[key]) != "nan":
            val_str = str(row[key]).lower()
            try:
                nums = re.findall(r"[-+]?\d*\.\d+|\d+", val_str)
                if nums:
                    val = float(nums[0])
                    if "'" in val_str or "ft" in val_str or "feet" in val_str:
                        val *= 0.3048
                    elif val > 50:
                        val *= 0.3048
                    return val
            except:
                pass

    if "lanes" in row and str(row["lanes"]) != "nan":
        try:
            clean = re.findall(r"\d+", str(row["lanes"]))
            if clean:
                lanes = int(clean[0])
                lanes = max(1, min(lanes, 6))
                return lanes * LANE_WIDTH_DEFAULT
        except:
            pass

    highway = row.get("highway", "residential")
    if isinstance(highway, list):
        highway = highway[0]
    return DEFAULT_WIDTHS.get(highway, 4.0)


def classify_building(row, height, area):
    """
    Classifies a building as Residential (Pop) or Commercial (Jobs)
    and estimates the count based on volume.
    """
    b_type = str(row.get("building", "yes")).lower()
    amenity = str(row.get("amenity", "")).lower()
    office = str(row.get("office", "")).lower()
    shop = str(row.get("shop", "")).lower()

    volume = area * height

    # Lists of tags
    residential_tags = [
        "apartments",
        "residential",
        "house",
        "detached",
        "terrace",
        "dormitory",
        "hotel",
    ]
    commercial_tags = [
        "commercial",
        "office",
        "retail",
        "industrial",
        "university",
        "school",
        "hospital",
        "public",
    ]

    is_res = any(t in b_type for t in residential_tags)
    is_com = (
        any(t in b_type for t in commercial_tags)
        or (amenity != "nan" and amenity != "")
        or (office != "nan" and office != "")
        or (shop != "nan" and shop != "")
    )

    # Default logic if generic "yes"
    if not is_res and not is_com:
        # Small buildings likely houses, big generic likely commercial in city center
        if volume > 5000:
            is_com = True
        else:
            is_res = True

    pop = 0
    jobs = 0
    category = "none"
    density_score = 0

    if is_res:
        pop = round(volume * POP_DENSITY_FACTOR)
        category = "residential"
        density_score = min(1.0, pop / 500)  # Normalize for color (0-1)
    elif is_com:
        jobs = round(volume * JOB_DENSITY_FACTOR)
        category = "commercial"
        density_score = min(1.0, jobs / 1000)  # Normalize for color (0-1)

    return category, density_score, pop, jobs


def parse_geometry(geom, center_x, center_y):
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
    "amenity": True,  # Fetch amenities to help classify jobs
    "office": True,
    "shop": True,
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

# We will store building data to map it to graph nodes later
building_data_points = []  # (x, y, pop, jobs)

print("3. Processing Visual Layers & Census Simulation...")
for idx, row in gdf_visual.iterrows():
    polygons = parse_geometry(row.geometry, center_x, center_y)

    for poly_data in polygons:
        # 1. Buildings (With Zoning Logic)
        if "building" in row and str(row["building"]) != "nan":
            height = get_height(row)
            area = row.geometry.area

            # Zoning / Census Simulation
            cat, score, pop, jobs = classify_building(row, height, area)

            # Store centroid for graph mapping
            cx = row.geometry.centroid.x - center_x
            cy = row.geometry.centroid.y - center_y
            building_data_points.append([cx, cy, pop, jobs])

            output_visual["buildings"].append(
                {
                    "shape": poly_data,
                    "height": height,
                    "data": {"type": cat, "density": score, "pop": pop, "jobs": jobs},
                }
            )

        # 2. Water
        elif ("natural" in row and str(row["natural"]) != "nan") or (
            "water" in row and str(row["water"]) != "nan"
        ):
            output_visual["water"].append({"shape": poly_data})

        # 3. Parks
        else:
            output_visual["parks"].append({"shape": poly_data})

print("   Buffering roads...")
road_polys = []
for idx, row in gdf_edges.iterrows():
    width = estimate_road_width(row)
    buffered = row.geometry.buffer(width / 2, cap_style=2, join_style=2)
    road_polys.append(buffered)

if road_polys:
    merged_roads = unary_union(road_polys)
    road_shapes = parse_geometry(merged_roads, center_x, center_y)
    for shape in road_shapes:
        output_visual["roads"].append({"shape": shape})

print("4. Mapping Census Data to Graph Nodes...")
# Create a KDTree of building centroids
if building_data_points:
    b_coords = np.array([[b[0], b[1]] for b in building_data_points])
    b_data = np.array([[b[2], b[3]] for b in building_data_points])  # pop, jobs
    tree = cKDTree(b_coords)

for node_id, row in gdf_nodes.iterrows():
    nx = row.geometry.x - center_x
    ny = row.geometry.y - center_y

    # Find all buildings within 100m of this node
    if building_data_points:
        indices = tree.query_ball_point([nx, ny], r=100)
        if indices:
            # Sum pop/jobs of nearby buildings
            nearby_stats = np.sum(b_data[indices], axis=0)
            node_pop = int(nearby_stats[0])
            node_jobs = int(nearby_stats[1])
        else:
            node_pop, node_jobs = 0, 0
    else:
        node_pop, node_jobs = 0, 0

    output_routing["nodes"][int(node_id)] = {
        "x": round(nx, 2),
        "y": round(ny, 2),
        "pop": node_pop,  # Store for gameplay later
        "jobs": node_jobs,
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
            "length": round(float(row.geometry.length), 2),
        }
    )

out_dir = os.path.join(os.path.dirname(__file__), "../public")
os.makedirs(out_dir, exist_ok=True)
with open(os.path.join(out_dir, "city_data.json"), "w") as f:
    json.dump(output_visual, f)
with open(os.path.join(out_dir, "routing_graph.json"), "w") as f:
    json.dump(output_routing, f)
print(f"Done! Exported to {out_dir}")
