import osmnx as ox
import json
import os

# ==========================================
# 1. Configuration
# ==========================================
PLACE_NAME = "Wisconsin State Capitol, Madison, USA"
DIST = 3000

# ==========================================
# 2. Data Fetching
# ==========================================
print(f"Downloading data for {PLACE_NAME}...")

# Define tags for different layers
tags = {
    "building": True,
    "natural": ["water", "bay", "coastline"],
    "landuse": ["grass", "forest", "park", "recreation_ground"],
    "leisure": ["park", "garden"],
    "highway": True,
}

try:
    # OSMNX v2.0+
    gdf = ox.features.features_from_address(PLACE_NAME, tags=tags, dist=DIST)
except AttributeError:
    # OSMNX < v2.0
    gdf = ox.features_from_address(PLACE_NAME, tags=tags, dist=DIST)

# ==========================================
# 3. Projection & Normalization
# ==========================================
print("Projecting to local grid...")
gdf_proj = gdf.to_crs(gdf.estimate_utm_crs())

# Calculate center for (0,0,0) normalization
center_x = gdf_proj.geometry.centroid.x.mean()
center_y = gdf_proj.geometry.centroid.y.mean()

# ==========================================
# 4. Processing Functions
# ==========================================


def get_height(row):
    """Estimates building height from tags."""
    h = 10.0  # Default
    if "height" in row and str(row["height"]).lower() != "nan":
        try:
            # Extract numeric part
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


def parse_polygon(geom):
    """Extracts exterior coordinates from a Polygon."""
    if geom.is_empty:
        return []
    coords = list(geom.exterior.coords)
    # Simplify slightly to reduce vertex count if needed, or keep raw
    return [[round(x - center_x, 1), round(y - center_y, 1)] for x, y in coords]


def parse_linestring(geom):
    """Extracts coordinates from a LineString."""
    if geom.is_empty:
        return []
    coords = list(geom.coords)
    return [[round(x - center_x, 1), round(y - center_y, 1)] for x, y in coords]


# ==========================================
# 5. Categorization Loop
# ==========================================
output_data = {"buildings": [], "water": [], "parks": [], "roads": []}

print("Processing geometries...")

for idx, row in gdf_proj.iterrows():
    geom = row.geometry

    # Handle MultiPolygons by iterating over them
    geoms = [geom] if geom.geom_type in ["Polygon", "LineString"] else []
    if geom.geom_type == "MultiPolygon":
        geoms = list(geom.geoms)
    elif geom.geom_type == "MultiLineString":
        geoms = list(geom.geoms)

    for sub_geom in geoms:
        # 1. BUILDINGS
        if "building" in row and str(row["building"]) != "nan":
            if sub_geom.geom_type == "Polygon":
                output_data["buildings"].append(
                    {"shape": parse_polygon(sub_geom), "height": get_height(row)}
                )

        # 2. WATER
        elif ("natural" in row and row["natural"] in tags["natural"]) or (
            "water" in row and str(row["water"]) != "nan"
        ):
            if sub_geom.geom_type == "Polygon":
                output_data["water"].append({"shape": parse_polygon(sub_geom)})

        # 3. PARKS / GREENSPACE
        elif ("leisure" in row and row["leisure"] in tags["leisure"]) or (
            "landuse" in row and row["landuse"] in tags["landuse"]
        ):
            if sub_geom.geom_type == "Polygon":
                output_data["parks"].append({"shape": parse_polygon(sub_geom)})

        # 4. ROADS
        elif "highway" in row and str(row["highway"]) != "nan":
            if sub_geom.geom_type == "LineString":
                output_data["roads"].append({"path": parse_linestring(sub_geom)})

# ==========================================
# 6. Save File
# ==========================================
output_path = os.path.join(os.path.dirname(__file__), "../public/city_data.json")
os.makedirs(os.path.dirname(output_path), exist_ok=True)

with open(output_path, "w") as f:
    json.dump(output_data, f)

print(
    f"Exported:"
    f"\n  Buildings: {len(output_data['buildings'])}"
    f"\n  Roads:     {len(output_data['roads'])}"
    f"\n  Water:     {len(output_data['water'])}"
    f"\n  Parks:     {len(output_data['parks'])}"
)
print(f"Saved to {output_path}")
