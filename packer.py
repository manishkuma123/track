
import sys
import json

def can_place(box, position, placed_boxes, container):
    x, y, z = position
    bx, by, bz = box["length"], box["width"], box["height"]

    if x + bx > container["length"] or y + by > container["width"] or z + bz > container["height"]:
        return False
    
    for other in placed_boxes:
        ox, oy, oz = other["x"], other["y"], other["z"]
        ol, ow, oh = other["length"], other["width"], other["height"]

        if not (x >= ox + ol or x + bx <= ox or
                y >= oy + ow or y + by <= oy or
                z >= oz + oh or z + bz <= oz):
            return False

    return True


def can_place_weight(box, placed_boxes, container):
    """Check if adding this box would exceed weight capacity"""
    if "weight_capacity" not in container or container["weight_capacity"] is None:
        return True 
    
    current_weight = sum(placed_box.get("weight", 0) for placed_box in placed_boxes)
    box_weight = box.get("weight", 0)
    
    return current_weight + box_weight <= container["weight_capacity"]

 

def get_all_possible_positions(container, placed_boxes):
    positions = set()
    positions.add((0, 0, 0))

    for box in placed_boxes:
        positions.update([
            (box["x"] + box["length"], box["y"], box["z"]),
            (box["x"], box["y"] + box["width"], box["z"]),
            (box["x"], box["y"], box["z"] + box["height"]),
            (box["x"] + box["length"], box["y"] + box["width"], box["z"]),
            (box["x"] + box["length"], box["y"], box["z"] + box["height"]),
            (box["x"], box["y"] + box["width"], box["z"] + box["height"]),
            (box["x"] + box["length"], box["y"] + box["width"], box["z"] + box["height"])
        ])

    valid_positions = [
        pos for pos in positions
        if (0 <= pos[0] < container["length"] and
            0 <= pos[1] < container["width"] and
            0 <= pos[2] < container["height"])
    ]

    valid_positions.sort(key=lambda p: (p[2], p[1], p[0])) 
    return valid_positions

def find_best_position(box, container, placed_boxes):
  
    if not can_place_weight(box, placed_boxes, container):
        return None
    positions = get_all_possible_positions(container, placed_boxes)
    for pos in positions:
        if can_place(box, pos, placed_boxes, container):
            return pos
    return None

def get_box_rotations(box):
    l, w, h = box["length"], box["width"], box["height"]
    weight = box.get("weight", 0)
    name = box["name"]
    
    rotations = [
        {"length": l, "width": w, "height": h, "name": name, "weight": weight},
        {"length": l, "width": h, "height": w, "name": name, "weight": weight},
        {"length": w, "width": l, "height": h, "name": name, "weight": weight},
        {"length": w, "width": h, "height": l, "name": name, "weight": weight},
        {"length": h, "width": l, "height": w, "name": name, "weight": weight},
        {"length": h, "width": w, "height": l, "name": name, "weight": weight}
    ]

    unique_rotations = []
    seen = set()
    for rot in rotations:
        dims = tuple(sorted([rot["length"], rot["width"], rot["height"]]))
        if dims not in seen:
            seen.add(dims)
            unique_rotations.append(rot)
    return unique_rotations

def calculate_optimal_quantity(box_type, container):
    box_volume = box_type["length"] * box_type["width"] * box_type["height"]
    container_volume = container["length"] * container["width"] * container["height"]
    
    if box_volume <= 0:
        return 1
    
 
    theoretical_max_volume = int(container_volume / box_volume)
    packing_efficiency = 0.7
    practical_max_volume = max(1, int(theoretical_max_volume * packing_efficiency))
    
 
    max_by_weight = None
    if "weight_capacity" in container and container["weight_capacity"] is not None:
        box_weight = box_type.get("weight", 0)
        if box_weight > 0:
            max_by_weight = int(container["weight_capacity"] / box_weight)
            return min(practical_max_volume, max_by_weight)
    
    return practical_max_volume

def calculate_max_possible_boxes(box_types, container):
    """Calculate maximum possible boxes for each type individually"""
    max_calculations = []
    
    for box_type in box_types:
        box_volume = box_type["length"] * box_type["width"] * box_type["height"]
        container_volume = container["length"] * container["width"] * container["height"]
        
       
        theoretical_max_volume = int(container_volume / box_volume) if box_volume > 0 else 0
        packing_efficiency = 0.7
        practical_max_volume = max(1, int(theoretical_max_volume * packing_efficiency)) if theoretical_max_volume > 0 else 0
        
       
        max_by_weight = None
        if "weight_capacity" in container and container["weight_capacity"] is not None:
            box_weight = box_type.get("weight", 0)
            if box_weight > 0:
                max_by_weight = int(container["weight_capacity"] / box_weight)
        
      
        if max_by_weight is not None:
            max_possible = min(practical_max_volume, max_by_weight)
            limiting_factor = "weight" if max_by_weight < practical_max_volume else "space"
        else:
            max_possible = practical_max_volume
            limiting_factor = "space"
        
        max_calculations.append({
            "name": box_type["name"],
            "max_possible": max_possible,
            "max_by_volume": practical_max_volume,
            "max_by_weight": max_by_weight,
            "limiting_factor": limiting_factor,
            "requested_quantity": box_type.get("quantity", max_possible)
        })
    
    return max_calculations

# def pack_boxes_greedy(container, box_types):
#     placed_boxes = []
#     summary = []
#     sorted_boxes = sorted(box_types, key=lambda x: x["length"] * x["width"] * x["height"], reverse=True)

#     for box_type in sorted_boxes:
#         if "quantity" in box_type and box_type["quantity"] is not None:
#             target_quantity = box_type["quantity"]
#         else:
#             target_quantity = calculate_optimal_quantity(box_type, container)
        
#         count = 0
#         placed = []
#         max_attempts = target_quantity * 10
#         attempts = 0

#         while count < target_quantity and attempts < max_attempts:
#             attempts += 1
#             best_position = None
#             best_rotation = None

#             for rotation in get_box_rotations(box_type):
#                 position = find_best_position(rotation, container, placed_boxes)
#                 if position is not None:
#                     best_position = position
#                     best_rotation = rotation
#                     break

#             if best_position is not None:
#                 placed_box = {
#                     "x": best_position[0],
#                     "y": best_position[1],
#                     "z": best_position[2],
#                     "length": best_rotation["length"],
#                     "width": best_rotation["width"],
#                     "height": best_rotation["height"],
#                     "name": best_rotation["name"],
#                     "weight": best_rotation.get("weight", 0)
#                 }
#                 placed_boxes.append(placed_box)
#                 placed.append(placed_box)
#                 count += 1
#             else:
#                 break

#         not_placed = max(0, target_quantity - count) if "quantity" in box_type and box_type["quantity"] is not None else 0

#         summary.append({
#             "name": box_type["name"],
#             "length": box_type["length"],
#             "width": box_type["width"],
#             "height": box_type["height"],
#             "weight": box_type.get("weight", 0),
#             "requested_quantity": box_type.get("quantity", target_quantity),
#             "count": count,
#             "not_placed": not_placed,
#             "boxes": placed
#         })

#     return placed_boxes, summary
def pack_boxes_greedy(container, box_types):
    placed_boxes = []
    summary = []
    sorted_boxes = sorted(box_types, key=lambda x: x["length"] * x["width"] * x["height"], reverse=True)

    for box_type in sorted_boxes:
        if "quantity" in box_type and box_type["quantity"] is not None:
            target_quantity = box_type["quantity"]
        else:
            target_quantity = calculate_optimal_quantity(box_type, container)
        
        count = 0
        placed = []
        max_attempts = target_quantity * 10
        attempts = 0

        while count < target_quantity and attempts < max_attempts:
            attempts += 1
            best_position = None
            best_rotation = None

            for rotation in get_box_rotations(box_type):
                position = find_best_position(rotation, container, placed_boxes)
                if position is not None:
                    best_position = position
                    best_rotation = rotation
                    break

            if best_position is not None:
                placed_box = {
                    "x": best_position[0],
                    "y": best_position[1],
                    "z": best_position[2],
                    "length": best_rotation["length"],
                    "width": best_rotation["width"],
                    "height": best_rotation["height"],
                    "name": best_rotation["name"],
                    "weight": best_rotation.get("weight", 0),
                    "container_name": container.get("name")  # ✅ Added here
                }
                placed_boxes.append(placed_box)
                placed.append(placed_box)
                count += 1
            else:
                break

        not_placed = max(0, target_quantity - count) if "quantity" in box_type and box_type["quantity"] is not None else 0

        summary.append({
            "name": box_type["name"],
            "length": box_type["length"],
            "width": box_type["width"],
            "height": box_type["height"],
            "weight": box_type.get("weight", 0),
            "requested_quantity": box_type.get("quantity", target_quantity),
            "count": count,
            "not_placed": not_placed,
            "boxes": placed
        })

    return placed_boxes, summary

def calculate_space_utilization(container, placed_boxes):
    container_volume = container["length"] * container["width"] * container["height"]
    used_volume = sum(box["length"] * box["width"] * box["height"] for box in placed_boxes)
    return (used_volume / container_volume) * 100 if container_volume > 0 else 0

def calculate_weight_utilization(container, placed_boxes):
    if "weight_capacity" not in container or container["weight_capacity"] is None:
        return 0
    
    total_weight = sum(box.get("weight", 0) for box in placed_boxes)
    return (total_weight / container["weight_capacity"]) * 100 if container["weight_capacity"] > 0 else 0

def main():
    try:
        input_data = json.load(sys.stdin)
        container = input_data["container"]
        box_types = input_data["boxes"]

        if not container or not box_types:
            raise ValueError("Container and boxes data are required")

        placed_boxes, summary = pack_boxes_greedy(container, box_types)
        max_possible_calculations = calculate_max_possible_boxes(box_types, container)
        
        total_boxes = sum(item["count"] for item in summary)
        total_weight = sum(box.get("weight", 0) for box in placed_boxes)
        
        space_utilization = calculate_space_utilization(container, placed_boxes)
        weight_utilization = calculate_weight_utilization(container, placed_boxes)
        
        container_full = space_utilization > 95.0
        weight_limit_reached = weight_utilization > 95.0

        result = {
            "container_full": container_full,
            "weight_limit_reached": weight_limit_reached,
            "total_boxes": total_boxes,
            "total_weight": round(total_weight, 2),
            "space_utilization": round(space_utilization, 2),
            "weight_utilization": round(weight_utilization, 2),
            "max_possible_boxes": max_possible_calculations,
            "box_summary": summary
        }
        

        if "weight_capacity" in container and container["weight_capacity"] is not None:
            result["weight_capacity"] = container["weight_capacity"]
            result["remaining_weight_capacity"] = round(container["weight_capacity"] - total_weight, 2)

        print(json.dumps(result, indent=2))

    except Exception as e:
        error_result = {
            "error": str(e),
            "container_full": False,
            "weight_limit_reached": False,
            "total_boxes": 0,
            "total_weight": 0,
            "space_utilization": 0,
            "weight_utilization": 0,
            "weight_capacity": 0,
            "remaining_weight_capacity": 0,
            "box_summary": []
        }
        print(json.dumps(error_result, indent=2))

if __name__ == "__main__":
    main()
