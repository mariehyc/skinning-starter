import { Mat4, Mat3, Quat, Vec3, Vec4 } from "../lib/TSM.js";
import { AttributeLoader, MeshGeometryLoader, BoneLoader, MeshLoader } from "./AnimationFileLoader.js";

//General class for handling GLSL attributes
export class Attribute {
  values: Float32Array;
  count: number;
  itemSize: number;

  constructor(attr: AttributeLoader) {
    this.values = attr.values;
    this.count = attr.count;
    this.itemSize = attr.itemSize;
  }
}

//Class for handling mesh vertices and skin weights
export class MeshGeometry {
  position: Attribute;
  normal: Attribute;
  uv: Attribute | null = null;
  skinIndex: Attribute; // bones indices that affect each vertex
  skinWeight: Attribute; // weight of associated bone
  v0: Attribute; // position of each vertex of the mesh *in the coordinate system of bone skinIndex[0]'s joint*. Perhaps useful for LBS.
  v1: Attribute;
  v2: Attribute;
  v3: Attribute;

  constructor(mesh: MeshGeometryLoader) {
    this.position = new Attribute(mesh.position);
    this.normal = new Attribute(mesh.normal);
    if (mesh.uv) { this.uv = new Attribute(mesh.uv); }
    this.skinIndex = new Attribute(mesh.skinIndex);
    this.skinWeight = new Attribute(mesh.skinWeight);
    this.v0 = new Attribute(mesh.v0);
    this.v1 = new Attribute(mesh.v1);
    this.v2 = new Attribute(mesh.v2);
    this.v3 = new Attribute(mesh.v3);
  }
}

//Class for handling bones in the skeleton rig
export class Bone {
  public selected: boolean = false;
  public parent!: Bone;
  public parentIndex: number;
  public children: Bone[] = [];
  public index: number;
  public ogPosition: Vec4;
  public ogEndpoint: Vec4;
  public ogEndpoint2: Vec4;
  public ogPosition2: Vec4;
  public position: Vec3; // current world-space joint position
  public endpoint: Vec3; // current world-space endpoint
  public rotation: Quat; // current orientation of the joint *with respect to world coordinates*
  public dMat!: Mat4;
  public tMat!: Mat4;
  public rotationMat: Mat4;

  constructor(bone: BoneLoader) {
    this.parentIndex = bone.parent;
    this.children = [];
    this.position = bone.position.copy();
    this.endpoint = bone.endpoint.copy();
    this.rotation = bone.rotation.copy();
    this.rotationMat = new Mat4().setIdentity();
    this.index = -1;

    this.ogPosition = new Vec4([0.0, 0.0, 0.0, 1.0]);
    this.ogPosition2 = new Vec4([0.0, 0.0, 0.0, 1.0]);
    const offset = bone.endpoint.copy().subtract(bone.position.copy());
    this.ogEndpoint = new Vec4([offset.x, offset.y, offset.z, 1.0]);
    this.ogEndpoint2 = new Vec4([offset.x, offset.y, offset.z, 1.0]);
  }

  private printMat4(matrix: Mat4): void {
    const rows: string[] = [];
    for (let r = 0; r < 4; r++) {
      const start = r * 4;
      rows.push(
        `${matrix.at(start + 0).toFixed(4)}\t${matrix.at(start + 1).toFixed(4)}\t${matrix.at(start + 2).toFixed(4)}\t${matrix.at(start + 3).toFixed(4)}`
      );
    }
    console.log(rows.join("\n"));
  }

  public boneTranslation(translate: Vec3): void {
    if (this.parentIndex === -1) {
      this.tMat = new Mat4([
        1.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 1.0, 0.0,
        this.position.x + translate.x,
        this.position.y + translate.y,
        this.position.z + translate.z,
        1.0]);
      this.dMat = this.tMat.multiply(this.rotationMat);
    } else {
      this.dMat = this.parent.dMat.copy().multiply(this.tMat).multiply(this.rotationMat);
    }

    this.rotation = this.dMat.copy().toMat3().toQuat();
    this.position = new Vec3(this.dMat.copy().multiplyVec4(this.ogPosition).xyz);
    this.endpoint = new Vec3(this.dMat.copy().multiplyVec4(this.ogEndpoint).xyz);

    for (const child of this.children) {
      child.boneTranslation(new Vec3([0, 0, 0]));
    }
  }

  public boneRotation(rotation: Mat4): void {
    this.rotationMat = rotation.copy().multiply(this.rotationMat);
    this.ogEndpoint2 = rotation.copy().multiplyVec4(this.ogEndpoint2);
    this.ogPosition2 = rotation.copy().multiplyVec4(this.ogPosition2);

    if (this.parentIndex === -1) {
      this.dMat = this.tMat.copy().multiply(this.rotationMat);
    } else {
      this.dMat = this.parent.dMat.copy().multiply(this.tMat).multiply(this.rotationMat);
    }

    this.rotation = this.dMat.copy().toMat3().toQuat();
    this.position = new Vec3(this.dMat.copy().multiplyVec4(this.ogPosition).xyz);
    this.endpoint = new Vec3(this.dMat.copy().multiplyVec4(this.ogEndpoint).xyz);

    for (const child of this.children) {
      child.boneRotation(new Mat4().setIdentity());
    }
  }

  public rotate(axis: Vec3, radians: number): Mat4 {
    if (Number.isNaN(axis.length()) || axis.length() === 0.0) {
      return new Mat4().setIdentity();
    }

    axis.normalize();
    const rotMat = new Mat4().setIdentity();
    rotMat.rotate(radians, axis);
    return rotMat;
  }
}

//Class for handling the overall mesh and rig
export class Mesh {
  public geometry: MeshGeometry;
  public worldMatrix: Mat4; // in this project all meshes and rigs have been transformed into world coordinates for you
  public rotation: Vec3;
  public bones: Bone[];
  public rootBone: Bone[];
  public materialName: string;
  public imgSrc: String | null;

  private boneIndices: number[];
  private bonePositions: Float32Array;
  private boneIndexAttribute: Float32Array;

  constructor(mesh: MeshLoader) {
    this.geometry = new MeshGeometry(mesh.geometry);
    this.worldMatrix = mesh.worldMatrix.copy();
    this.rotation = mesh.rotation.copy();

    this.bones = [];
    this.rootBone = [];
    mesh.bones.forEach((loaderBone) => {
      const bone = new Bone(loaderBone);
      this.bones.push(bone);
    });

    this.bones.forEach((bone, index) => {
      bone.index = index;
      if (bone.parentIndex >= 0) {
        const parentBone = this.bones[bone.parentIndex];
        bone.parent = parentBone;
        parentBone.children.push(bone);
        bone.tMat = new Mat4([
          1.0, 0.0, 0.0, 0.0,
          0.0, 1.0, 0.0, 0.0,
          0.0, 0.0, 1.0, 0.0,
          bone.position.x - parentBone.position.x,
          bone.position.y - parentBone.position.y,
          bone.position.z - parentBone.position.z,
          1.0]);
      } else {
        this.rootBone.push(bone);
        bone.parent = bone;
        bone.tMat = new Mat4([
          1.0, 0.0, 0.0, 0.0,
          0.0, 1.0, 0.0, 0.0,
          0.0, 0.0, 1.0, 0.0,
          bone.position.x, bone.position.y, bone.position.z, 1.0]);
        bone.dMat = new Mat4([
          1.0, 0.0, 0.0, 0.0,
          0.0, 1.0, 0.0, 0.0,
          0.0, 0.0, 1.0, 0.0,
          bone.position.x, bone.position.y, bone.position.z, 1.0]);
      }
    });

    this.rootBone.forEach((bone) => {
      const stack: Bone[] = [bone];
      while (stack.length > 0) {
        const current = stack.pop()!;
        if (current.parentIndex >= 0) {
          current.dMat = current.parent.dMat.copy().multiply(current.tMat.copy());
        }
        for (let i = current.children.length - 1; i >= 0; i--) {
          stack.push(current.children[i]);
        }
      }
    });

    this.materialName = mesh.materialName;
    this.imgSrc = null;
    this.boneIndices = Array.from(mesh.boneIndices);
    this.bonePositions = new Float32Array(mesh.bonePositions);
    this.boneIndexAttribute = new Float32Array(mesh.boneIndexAttribute);
  }

  public getBoneIndices(): Uint32Array {
    return new Uint32Array(this.boneIndices);
  }

  public getBonePositions(): Float32Array {
    return this.bonePositions;
  }

  public getBoneIndexAttribute(): Float32Array {
    return this.boneIndexAttribute;
  }

  public getBoneTranslations(): Float32Array {
    const trans = new Float32Array(3 * this.bones.length);
    this.bones.forEach((bone, index) => {
      const res = bone.position.xyz;
      for (let i = 0; i < res.length; i++) {
        trans[3 * index + i] = res[i];
      }
    });
    return trans;
  }

  public getBoneRotations(): Float32Array {
    const rots = new Float32Array(4 * this.bones.length);
    this.bones.forEach((bone, index) => {
      const res = bone.rotation.xyzw;
      for (let i = 0; i < res.length; i++) {
        rots[4 * index + i] = res[i];
      }
    });
    return rots;
  }

  public static generateBoneCylinder(position: Vec3, endpoint: Vec3, radius: number = 0.1): { positions: Float32Array; indices: Uint32Array } {
    const segments = 6;
    const length = Vec3.distance(position, endpoint);
    const axis = Vec3.difference(endpoint, position).normalize();

    const hexVertices: Vec3[] = [];
    const angleStep = (2 * Math.PI) / segments;

    const up = new Vec3([0, 1, 0]);
    let rotationAxis = Vec3.cross(up, axis);
    let rotationAngle = 0;
    if (rotationAxis.length() < 1e-5) {
      rotationAxis = new Vec3([1, 0, 0]);
    } else {
      rotationAxis.normalize();
      rotationAngle = Math.acos(Vec3.dot(up, axis));
    }
    const rotation = Quat.fromAxisAngle(rotationAxis, rotationAngle);

    for (let i = 0; i < 2; i++) {
      const height = i * length;
      for (let j = 0; j < segments; j++) {
        const angle = angleStep * j;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        let vert = new Vec3([x, height, z]);
        vert = rotation.multiplyVec3(vert);
        hexVertices.push(vert.add(position));
      }
    }

    const indices: number[] = [];
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      indices.push(i, next);
      indices.push(segments + i, segments + next);
      indices.push(i, segments + i);
    }

    const positions = new Float32Array(hexVertices.length * 3);
    hexVertices.forEach((v, i) => {
      positions[i * 3] = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;
    });

    return {
      positions,
      indices: new Uint32Array(indices)
    };
  }
}
