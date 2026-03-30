import { Camera } from "../lib/webglutils/Camera.js";
import { Mat4, Vec3, Vec4, Vec2 } from "../lib/TSM.js";
export var Mode;
(function (Mode) {
    Mode[Mode["playback"] = 0] = "playback";
    Mode[Mode["edit"] = 1] = "edit";
})(Mode || (Mode = {}));
export class GUI {
    constructor(canvas, animation) {
        this.selectedBone = -1;
        this.boneDragging = false;
        this.boneSelected = false;
        this.rootTranslating = false;
        this.time = 0;
        this.mode = Mode.edit;
        this.hoverX = 0;
        this.hoverY = 0;
        this.height = canvas.height;
        this.viewPortHeight = this.height - 200;
        this.width = canvas.width;
        this.prevX = 0;
        this.prevY = 0;
        this.prevX2 = 0;
        this.prevY2 = 0;
        this.animation = animation;
        this.reset();
        this.registerEventListeners(canvas);
    }
    getNumKeyFrames() {
        return 0;
    }
    getTime() {
        return this.time;
    }
    getMaxTime() {
        return 0;
    }
    reset() {
        this.fps = false;
        this.dragging = false;
        this.time = 0;
        this.mode = Mode.edit;
        this.camera = new Camera(new Vec3([0, 0, -6]), new Vec3([0, 0, 0]), new Vec3([0, 1, 0]), 45, this.width / this.viewPortHeight, 0.1, 1000.0);
        this.selectedBone = -1;
        this.boneDragging = false;
        this.boneSelected = false;
    }
    setCamera(pos, target, upDir, fov, aspect, zNear, zFar) {
        this.camera = new Camera(pos, target, upDir, fov, aspect, zNear, zFar);
    }
    viewMatrix() {
        return this.camera.viewMatrix();
    }
    projMatrix() {
        return this.camera.projMatrix();
    }
    dragStart(mouse) {
        if (mouse.offsetY > 600) {
            return;
        }
        this.dragging = true;
        this.prevX = mouse.screenX;
        this.prevY = mouse.screenY;
        this.prevX2 = mouse.offsetX;
        this.prevY2 = mouse.offsetY;
        if (this.boneSelected) {
            const isRoot = this.closestBone && this.closestBone.parentIndex === -1;
            if (isRoot && mouse.shiftKey) {
                this.rootTranslating = true;
                this.boneDragging = false;
            }
            else {
                this.rootTranslating = false;
                this.boneDragging = true;
            }
        }
    }
    incrementTime(dT) {
        if (this.mode === Mode.playback) {
            this.time += dT;
            if (this.time >= this.getMaxTime()) {
                this.time = 0;
                this.mode = Mode.edit;
            }
        }
    }
    screenToWorldRay(x, y) {
        const ndcX = (x / this.width) * 2 - 1;
        const ndcY = 1 - (y / this.viewPortHeight) * 2;
        const nearPoint = new Vec4([ndcX, ndcY, -1, 1]);
        const farPoint = new Vec4([ndcX, ndcY, 1, 1]);
        const invProjMatrix = this.camera.projMatrix().inverse();
        const invViewMatrix = this.camera.viewMatrix().inverse();
        const nearWorldPoint = nearPoint.multiplyMat4(invProjMatrix).multiplyMat4(invViewMatrix);
        const farWorldPoint = farPoint.multiplyMat4(invProjMatrix).multiplyMat4(invViewMatrix);
        nearWorldPoint.scale(1.0 / nearWorldPoint.w);
        farWorldPoint.scale(1.0 / farWorldPoint.w);
        const rayOrigin = new Vec4([nearWorldPoint.x, nearWorldPoint.y, nearWorldPoint.z, 1.0]);
        const rayDirection = new Vec4([
            farWorldPoint.x - nearWorldPoint.x,
            farWorldPoint.y - nearWorldPoint.y,
            farWorldPoint.z - nearWorldPoint.z,
            0.0
        ]).normalize();
        return { origin: rayOrigin, direction: rayDirection };
    }
    pickBone(rayOrigin, rayDirection) {
        let closestDistance = Number.MAX_VALUE;
        let closestBoneIndex = -1;
        const mesh = this.animation.getScene().meshes[0];
        mesh.bones.forEach((bone, index) => {
            const boneVec = bone.endpoint.copy().subtract(bone.position).normalize();
            let randVec;
            if (Math.abs(boneVec.x) <= Math.abs(boneVec.y) && Math.abs(boneVec.x) <= Math.abs(boneVec.z)) {
                randVec = new Vec3([1, 0, 0]);
            }
            else if (Math.abs(boneVec.y) <= Math.abs(boneVec.x) && Math.abs(boneVec.y) <= Math.abs(boneVec.z)) {
                randVec = new Vec3([0, 1, 0]);
            }
            else {
                randVec = new Vec3([0, 0, 1]);
            }
            const boneX = Vec3.cross(boneVec.copy(), randVec.copy()).normalize();
            const boneZ = Vec3.cross(boneX.copy(), boneVec.copy()).normalize();
            const translation = new Mat4([
                1.0, 0.0, 0.0, 0.0,
                0.0, 1.0, 0.0, 0.0,
                0.0, 0.0, 1.0, 0.0,
                -bone.position.x, -bone.position.y, -bone.position.z, 1.0
            ]);
            const rotation = new Mat4([
                boneX.x, boneVec.x, boneZ.x, 0.0,
                boneX.y, boneVec.y, boneZ.y, 0.0,
                boneX.z, boneVec.z, boneZ.z, 0.0,
                0.0, 0.0, 0.0, 1.0
            ]);
            const boneLocal = rotation.multiply(translation);
            const rayOriginBone = boneLocal.multiplyVec4(rayOrigin);
            const rayDirBone = boneLocal.multiplyVec4(rayDirection).normalize();
            const boneLength = bone.endpoint.copy().subtract(bone.position).length();
            const radius = 0.05;
            let foundIntersection = false;
            let tIntersect = Number.MAX_VALUE;
            if (rayDirBone.y !== 0) {
                const t1 = -rayOriginBone.y / rayDirBone.y;
                const t2 = (boneLength - rayOriginBone.y) / rayDirBone.y;
                [t1, t2].forEach(t => {
                    if (t >= 0) {
                        const px = rayOriginBone.x + rayDirBone.x * t;
                        const pz = rayOriginBone.z + rayDirBone.z * t;
                        if (px * px + pz * pz <= radius) {
                            if (t < tIntersect) {
                                tIntersect = t;
                                foundIntersection = true;
                            }
                        }
                    }
                });
            }
            const a = rayDirBone.x * rayDirBone.x + rayDirBone.z * rayDirBone.z;
            const b = 2 * (rayOriginBone.x * rayDirBone.x + rayOriginBone.z * rayDirBone.z);
            const c = rayOriginBone.x * rayOriginBone.x + rayOriginBone.z * rayOriginBone.z - radius;
            if (a !== 0) {
                const discriminant = b * b - 4 * a * c;
                if (discriminant >= 0.0) {
                    const t1 = (-b + Math.sqrt(discriminant)) / (2 * a);
                    const t2 = (-b - Math.sqrt(discriminant)) / (2 * a);
                    [t1, t2].filter(val => val >= 0.0).forEach(t => {
                        const intersectPoint = new Vec4([
                            rayOriginBone.x + rayDirBone.x * t,
                            rayOriginBone.y + rayDirBone.y * t,
                            rayOriginBone.z + rayDirBone.z * t,
                            1.0
                        ]);
                        if (intersectPoint.y >= 0 && intersectPoint.y <= boneLength) {
                            if (t < tIntersect) {
                                tIntersect = t;
                                foundIntersection = true;
                            }
                        }
                    });
                }
            }
            if (foundIntersection && tIntersect < closestDistance) {
                closestDistance = tIntersect;
                closestBoneIndex = index;
                this.closestBone = bone;
                this.boneSelected = true;
            }
        });
        if (closestBoneIndex === -1) {
            this.boneSelected = false;
            this.closestBone = null;
        }
        this.selectedBone = closestBoneIndex;
    }
    drag(mouse) {
        const x = mouse.offsetX;
        const y = mouse.offsetY;
        const { origin, direction } = this.screenToWorldRay(x, y);
        if (!this.dragging && !this.boneDragging) {
            this.pickBone(origin, direction);
        }
        if (this.dragging && this.boneDragging && this.closestBone) {
            const boneEndNDC = (new Vec4([this.closestBone.endpoint.x, this.closestBone.endpoint.y, this.closestBone.endpoint.z, 1.0]))
                .multiplyMat4(this.camera.viewMatrix().copy()).multiplyMat4(this.camera.projMatrix().copy());
            boneEndNDC.scale(1.0 / boneEndNDC.w);
            const boneEndScreen = ((boneEndNDC.x + 1) / 2) * this.width;
            const boneEndScreenY = ((1 - boneEndNDC.y) / 2) * this.viewPortHeight;
            const boneEndScreenCoords = new Vec2([boneEndScreen, boneEndScreenY]);
            const boneNDC = (new Vec4([this.closestBone.position.x, this.closestBone.position.y, this.closestBone.position.z, 1.0]))
                .multiplyMat4(this.camera.viewMatrix().copy()).multiplyMat4(this.camera.projMatrix().copy());
            boneNDC.scale(1.0 / boneNDC.w);
            const boneScreen = ((boneNDC.x + 1) / 2) * this.width;
            const boneScreenY = ((1 - boneNDC.y) / 2) * this.viewPortHeight;
            const boneScreenCoords = new Vec2([boneScreen, boneScreenY]);
            const startVector = boneEndScreenCoords.subtract(boneScreenCoords).normalize();
            const endVector = new Vec2([x, y]).subtract(boneScreenCoords).normalize();
            const rotationAngle = (Math.atan2(startVector.y, startVector.x) - Math.atan2(endVector.y, endVector.x));
            const rotation = this.closestBone.rotate((this.closestBone.dMat.toMat3().inverse()).multiplyVec3(this.camera.forward().normalize()), rotationAngle);
            this.closestBone.boneRotation(rotation);
        }
        else if (this.dragging && this.rootTranslating && this.closestBone) {
            const dx = mouse.screenX - this.prevX;
            const dy = mouse.screenY - this.prevY;
            this.prevX = mouse.screenX;
            this.prevY = mouse.screenY;
            const rightMove = this.camera.right().scale(-dx * GUI.panSpeed);
            const upMove = this.camera.up().scale(dy * GUI.panSpeed);
            const move = rightMove.add(upMove);
            this.closestBone.boneTranslation(move);
        }
        else if (this.dragging) {
            const dx = mouse.screenX - this.prevX;
            const dy = mouse.screenY - this.prevY;
            this.prevX = mouse.screenX;
            this.prevY = mouse.screenY;
            const mouseDir = this.camera.right();
            mouseDir.scale(-dx);
            mouseDir.add(this.camera.up().scale(dy));
            mouseDir.normalize();
            if (dx === 0 && dy === 0) {
                return;
            }
            switch (mouse.buttons) {
                case 1: {
                    let rotAxis = Vec3.cross(this.camera.forward(), mouseDir);
                    rotAxis = rotAxis.normalize();
                    if (this.fps) {
                        this.camera.rotate(rotAxis, GUI.rotationSpeed);
                    }
                    else {
                        this.camera.orbitTarget(rotAxis, GUI.rotationSpeed);
                    }
                    break;
                }
                case 2: {
                    this.camera.offsetDist(Math.sign(mouseDir.y) * GUI.zoomSpeed);
                    break;
                }
                default: {
                    break;
                }
            }
        }
    }
    getModeString() {
        switch (this.mode) {
            case Mode.edit: {
                return "edit: " + this.getNumKeyFrames() + " keyframes";
            }
            case Mode.playback: {
                return "playback: " + this.getTime().toFixed(2) + " / " + this.getMaxTime().toFixed(2);
            }
        }
    }
    dragEnd(mouse) {
        this.dragging = false;
        this.prevX = 0;
        this.prevY = 0;
        this.boneDragging = false;
        this.rootTranslating = false;
    }
    onKeydown(key) {
        switch (key.code) {
            case "Digit1": {
                this.animation.setScene("./static/assets/skinning/split_cube.dae");
                break;
            }
            case "Digit2": {
                this.animation.setScene("./static/assets/skinning/long_cubes.dae");
                break;
            }
            case "Digit3": {
                this.animation.setScene("./static/assets/skinning/simple_art.dae");
                break;
            }
            case "Digit4": {
                this.animation.setScene("./static/assets/skinning/mapped_cube.dae");
                break;
            }
            case "Digit5": {
                this.animation.setScene("./static/assets/skinning/robot.dae");
                break;
            }
            case "Digit6": {
                this.animation.setScene("./static/assets/skinning/head.dae");
                break;
            }
            case "Digit7": {
                this.animation.setScene("./static/assets/skinning/wolf.dae");
                break;
            }
            case "KeyW": {
                this.camera.offset(this.camera.forward().negate(), GUI.zoomSpeed, true);
                break;
            }
            case "KeyA": {
                this.camera.offset(this.camera.right().negate(), GUI.zoomSpeed, true);
                break;
            }
            case "KeyS": {
                this.camera.offset(this.camera.forward(), GUI.zoomSpeed, true);
                break;
            }
            case "KeyD": {
                this.camera.offset(this.camera.right(), GUI.zoomSpeed, true);
                break;
            }
            case "KeyR": {
                this.animation.reset();
                break;
            }
            case "ArrowLeft": {
                if (this.boneSelected && this.closestBone) {
                    this.closestBone.boneRotation(this.closestBone.rotate(new Vec3(this.closestBone.ogEndpoint2.subtract(this.closestBone.ogPosition2).xyz), -GUI.rollSpeed));
                }
                else {
                    this.camera.roll(GUI.rollSpeed, false);
                }
                break;
            }
            case "ArrowRight": {
                if (this.boneSelected && this.closestBone) {
                    this.closestBone.boneRotation(this.closestBone.rotate(new Vec3(this.closestBone.ogEndpoint2.subtract(this.closestBone.ogPosition2).xyz), GUI.rollSpeed));
                }
                else {
                    this.camera.roll(GUI.rollSpeed, true);
                }
                break;
            }
            case "ArrowUp": {
                this.camera.offset(this.camera.up(), GUI.zoomSpeed, true);
                break;
            }
            case "ArrowDown": {
                this.camera.offset(this.camera.up().negate(), GUI.zoomSpeed, true);
                break;
            }
            case "KeyF": {
                if (this.boneSelected && this.closestBone && this.closestBone.parentIndex === -1) {
                    this.closestBone.boneTranslation(this.camera.right().negate().scale(1 / 5));
                }
                break;
            }
            case "KeyG": {
                if (this.boneSelected && this.closestBone && this.closestBone.parentIndex === -1) {
                    this.closestBone.boneTranslation(this.camera.forward().scale(1 / 5));
                }
                break;
            }
            case "KeyT": {
                if (this.boneSelected && this.closestBone && this.closestBone.parentIndex === -1) {
                    this.closestBone.boneTranslation(this.camera.forward().negate().scale(1 / 5));
                }
                break;
            }
            case "KeyH": {
                if (this.boneSelected && this.closestBone && this.closestBone.parentIndex === -1) {
                    this.closestBone.boneTranslation(this.camera.right().scale(1 / 5));
                }
                break;
            }
            case "KeyO": {
                if (this.boneSelected && this.closestBone && this.closestBone.parentIndex === -1) {
                    this.closestBone.boneTranslation(this.camera.up().scale(1 / 5));
                }
                break;
            }
            case "KeyL": {
                if (this.boneSelected && this.closestBone && this.closestBone.parentIndex === -1) {
                    this.closestBone.boneTranslation(this.camera.up().negate().scale(1 / 5));
                }
                break;
            }
            default: {
                console.log("Key : '", key.code, "' was pressed.");
                break;
            }
        }
    }
    registerEventListeners(canvas) {
        window.addEventListener("keydown", (key) => this.onKeydown(key));
        canvas.addEventListener("mousedown", (mouse) => this.dragStart(mouse));
        canvas.addEventListener("mousemove", (mouse) => this.drag(mouse));
        canvas.addEventListener("mouseup", (mouse) => this.dragEnd(mouse));
        canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    }
}
GUI.rotationSpeed = 0.05;
GUI.zoomSpeed = 0.1;
GUI.rollSpeed = 0.1;
GUI.panSpeed = 0.1;
//# sourceMappingURL=Gui.js.map