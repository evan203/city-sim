import osmnx as ox
import json
import os

# 1. Configuration
PLACE_NAME = "Wisconsin State Capitol, Madison, USA"
DIST = 1500  # Meters radius around center

# 2. Download Data
print(f"Downloading data for {PLACE_NAME}...")
tags = {"building": True}

# UPDATED FOR V2.0: Access features module explicitly
try:
    # Try new v2.0 syntax
    gdf = ox.features.features_from_address(PLACE_NAME, tags=tags, dist=DIST)
except AttributeError:
    # Fallback for older versions
    gdf = ox.features_from_address(PLACE_NAME, tags=tags, dist=DIST)

# 3. Project to meters (Local Grid)
# UPDATED FOR V2.0: Use GeoPandas native estimation
print("Projecting to local grid...")
gdf_proj = gdf.to_crs(gdf.estimate_utm_crs())

# 4. Prepare Data for THREE.js
buildings = []

# Calculate center to normalize coordinates to (0,0)
center_x = gdf_proj.geometry.centroid.x.mean()
center_y = gdf_proj.geometry.centroid.y.mean()

print("Processing geometry...")
for _, row in gdf_proj.iterrows():
    if row.geometry.geom_type == "Polygon":
        # Get dimensions
        minx, miny, maxx, maxy = row.geometry.bounds
        width = maxx - minx
        depth = maxy - miny

        # Get Height (Clean dirty data)
        height = 10  # Default fallback

        # Check for 'height' tag
        if "height" in row and str(row["height"]) != "nan":
            try:
                # Clean strings like "10 m" or "approx 10"
                clean_h = "".join(
                    filter(lambda x: x.isdigit() or x == ".", str(row["height"]))
                )
                height = float(clean_h)
            except:
                pass
        # Check for 'building:levels' tag
        elif "building:levels" in row and str(row["building:levels"]) != "nan":
            try:
                clean_l = "".join(
                    filter(
                        lambda x: x.isdigit() or x == ".", str(row["building:levels"])
                    )
                )
                height = float(clean_l) * 3.5  # Approx 3.5m per floor
            except:
                pass

        # Normalize position relative to center
        x = (minx + maxx) / 2 - center_x
        z = center_y - (miny + maxy) / 2  # Invert Y for 3D Z-axis

        # Add to array: [x, z, width, depth, height]
        buildings.append(
            [
                round(x, 1),
                round(z, 1),
                round(width, 1),
                round(depth, 1),
                round(height, 1),
            ]
        )

# 5. Save to Public folder
output_path = os.path.join(os.path.dirname(__file__), "../public/city_data.json")

# Ensure directory exists just in case
os.makedirs(os.path.dirname(output_path), exist_ok=True)

with open(output_path, "w") as f:
    json.dump(buildings, f)

print(f"Done! Saved {len(buildings)} buildings to {output_path}")
