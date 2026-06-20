import argparse
import math
from pathlib import Path

import bpy


ATLAS_ANIMATIONS = [
    "atlas_weapon_idle.fbx",
    "atlas_weapon_run.fbx",
    "atlas_pulse_rifle_attack.fbx",
    "atlas_balance_burst_weapon.fbx",
]


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_fbx(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(path), automatic_bone_orientation=True)
    return [obj for obj in bpy.data.objects if obj not in before]


def find_armature(objects):
    for obj in objects:
        if obj.type == "ARMATURE":
            return obj
    return None


def find_action(armature):
    if armature and armature.animation_data and armature.animation_data.action:
        return armature.animation_data.action
    return None


def frame_range(action):
    if not action:
        return 1, 60

    start, end = action.frame_range
    return max(1, math.floor(start)), max(2, math.ceil(end))


def normalize_action(action):
    if not action:
        return

    for curve in action.fcurves:
        for key in curve.keyframe_points:
            key.interpolation = "BEZIER"


def clean_object_transforms(objects):
    for obj in objects:
        obj.location = (0, 0, 0)

        if obj.type == "ARMATURE":
            obj.rotation_euler = (0, 0, 0)
            obj.scale = (1, 1, 1)


def export_fbx(path, objects, start, end):
    bpy.ops.object.select_all(action="DESELECT")

    for obj in objects:
        obj.select_set(True)

    armature = find_armature(objects)
    if armature:
        bpy.context.view_layer.objects.active = armature

    bpy.ops.export_scene.fbx(
        filepath=str(path),
        use_selection=True,
        add_leaf_bones=False,
        bake_anim=True,
        bake_anim_use_all_bones=True,
        bake_anim_use_nla_strips=False,
        bake_anim_use_all_actions=False,
        bake_anim_force_startend_keying=True,
        bake_anim_step=1,
        bake_anim_simplify_factor=0,
        use_armature_deform_only=True,
        object_types={"ARMATURE", "MESH"},
        axis_forward="-Z",
        axis_up="Y",
        global_scale=1,
    )


def repair_animation(model_path, animation_path, output_path):
    clear_scene()

    model_objects = import_fbx(model_path)
    model_armature = find_armature(model_objects)

    if not model_armature:
        raise RuntimeError(f"No armature found in model: {model_path}")

    animation_objects = import_fbx(animation_path)
    animation_armature = find_armature(animation_objects)
    animation_action = find_action(animation_armature)

    if not animation_action:
        raise RuntimeError(f"No animation action found in: {animation_path}")

    fixed_action = animation_action.copy()
    fixed_action.name = f"{animation_path.stem}_fixed"
    normalize_action(fixed_action)

    model_armature.animation_data_create()
    model_armature.animation_data.action = fixed_action

    start, end = frame_range(fixed_action)
    bpy.context.scene.frame_start = start
    bpy.context.scene.frame_end = end

    bpy.ops.object.select_all(action="DESELECT")
    model_armature.select_set(True)
    bpy.context.view_layer.objects.active = model_armature
    bpy.ops.nla.bake(
        frame_start=start,
        frame_end=end,
        only_selected=True,
        visual_keying=True,
        clear_constraints=False,
        clear_parents=False,
        use_current_action=True,
        bake_types={"POSE"},
    )

    clean_object_transforms(model_objects)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    export_fbx(output_path, model_objects, start, end)


def main():
    parser = argparse.ArgumentParser(description="Repair Atlas FBX animations through Blender.")
    parser.add_argument("--repo", required=True, help="Path to the FamiliarBot-League repo.")
    parser.add_argument("--bot", default="atlas", help="Bot id to repair.")
    parser.add_argument("--replace", action="store_true", help="Replace source animations after exporting backups.")
    args = parser.parse_args()

    repo = Path(args.repo)
    bot_dir = repo / "assets" / "bots" / args.bot
    model_path = bot_dir / "model" / "atlas_all_rounder.fbx"
    animations_dir = bot_dir / "animations"
    output_dir = repo / "imports" / "blender-fixed" / args.bot / "animations"

    for filename in ATLAS_ANIMATIONS:
        source = animations_dir / filename
        target = output_dir / filename

        if not source.exists():
            print(f"missing: {source}")
            continue

        print(f"repairing: {source}")
        repair_animation(model_path, source, target)
        print(f"wrote: {target}")

    if args.replace:
        backup_dir = repo / "imports" / "blender-backups" / args.bot / "animations"
        backup_dir.mkdir(parents=True, exist_ok=True)

        for filename in ATLAS_ANIMATIONS:
            source = animations_dir / filename
            fixed = output_dir / filename
            backup = backup_dir / filename

            if source.exists() and fixed.exists():
                backup.write_bytes(source.read_bytes())
                source.write_bytes(fixed.read_bytes())
                print(f"replaced: {source}")


if __name__ == "__main__":
    main()
