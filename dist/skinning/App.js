import { Debugger } from "../lib/webglutils/Debugging.js";
import { CanvasAnimation, } from "../lib/webglutils/CanvasAnimation.js";
import { Floor } from "../lib/webglutils/Floor.js";
import { GUI } from "./Gui.js";
import { sceneFSText, sceneVSText, floorFSText, floorVSText, skeletonFSText, skeletonVSText, cylinderVSText, cylinderFSText, shadowVSText, shadowFSText, sBackVSText, sBackFSText } from "./Shaders.js";
import { Mat4, Vec4, Vec3 } from "../lib/TSM.js";
import { CLoader } from "./AnimationFileLoader.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";
import { Mesh } from "./Scene.js";
export class SkinningAnimation extends CanvasAnimation {
    constructor(canvas) {
        super(canvas);
        this.canvas2d = document.getElementById("textCanvas");
        this.ctx2 = this.canvas2d.getContext("2d");
        if (this.ctx2) {
            this.ctx2.font = "25px serif";
            this.ctx2.fillStyle = "#ffffffff";
        }
        this.ctx = Debugger.makeDebugContext(this.ctx);
        const gl = this.ctx;
        this.floor = new Floor();
        this.floorRenderPass = new RenderPass(this.extVAO, gl, floorVSText, floorFSText);
        this.sceneRenderPass = new RenderPass(this.extVAO, gl, sceneVSText, sceneFSText);
        this.skeletonRenderPass = new RenderPass(this.extVAO, gl, skeletonVSText, skeletonFSText);
        this.cylinderRenderPass = new RenderPass(this.extVAO, gl, cylinderVSText, cylinderFSText);
        this.shadowRenderPass = new RenderPass(this.extVAO, gl, shadowVSText, shadowFSText);
        this.gui = new GUI(this.canvas2d, this);
        this.lightPosition = new Vec4([-10, 10, -10, 1]);
        this.backgroundColor = new Vec4([0.0, 0.37254903, 0.37254903, 1.0]);
        this.initFloor();
        this.scene = new CLoader("");
        this.sBackRenderPass = new RenderPass(this.extVAO, gl, sBackVSText, sBackFSText);
        this.initGui();
        this.millis = new Date().getTime();
        this.loadedScene = "None";
        this.useLambert = false;
        this.lambertColor = new Float32Array([0.0, 0.0, 0.6]);
        this.defaultColor = new Float32Array([1.0, 1.0, 1.0]);
        this.currentColor = this.defaultColor;
        this.useTexture = false;
        this.shadowFramebuffer = null;
        this.shadowTexture = null;
        this.shadowDepthBuffer = null;
        this.shadowMapSize = 1024;
        this.lightViewMatrix = Mat4.identity.copy();
        this.lightProjMatrix = Mat4.identity.copy();
        this.lightViewProjMatrix = Mat4.identity.copy();
        this.initLightMatrices();
        this.initShadowResources();
    }
    getScene() {
        return this.scene;
    }
    reset() {
        this.gui.reset();
        this.setScene(this.loadedScene);
    }
    initGui() {
        const verts = new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]);
        this.sBackRenderPass.setIndexBufferData(new Uint32Array([1, 0, 2, 2, 0, 3]));
        this.sBackRenderPass.addAttribute("vertPosition", 2, this.ctx.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, verts);
        this.sBackRenderPass.setDrawData(this.ctx.TRIANGLES, 6, this.ctx.UNSIGNED_INT, 0);
        this.sBackRenderPass.setup();
    }
    initScene() {
        if (this.scene.meshes.length === 0) {
            return;
        }
        this.initModel();
        this.initShadowPass();
        this.initSkeleton();
        this.initCylinders();
        this.gui.reset();
    }
    buildCylinderGeometry(mesh) {
        const bones = mesh.bones;
        const allPositions = [];
        const allIndices = [];
        let indexOffset = 0;
        bones.forEach((bone) => {
            const cylinder = Mesh.generateBoneCylinder(bone.position, bone.endpoint);
            allPositions.push(...cylinder.positions);
            cylinder.indices.forEach(i => allIndices.push(i + indexOffset));
            indexOffset += cylinder.positions.length / 3;
        });
        return {
            positions: new Float32Array(allPositions),
            indices: new Uint32Array(allIndices)
        };
    }
    initCylinders() {
        if (this.scene.meshes.length === 0) {
            return;
        }
        const mesh = this.scene.meshes[0];
        const cylinderMesh = this.buildCylinderGeometry(mesh);
        this.cylinderRenderPass.setIndexBufferData(cylinderMesh.indices);
        this.cylinderRenderPass.addAttribute("vertPosition", 3, this.ctx.FLOAT, false, 3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, cylinderMesh.positions);
        this.cylinderRenderPass.addUniform("mWorld", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(Mat4.identity.all()));
        });
        this.cylinderRenderPass.addUniform("mProj", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().all()));
        });
        this.cylinderRenderPass.addUniform("mView", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().all()));
        });
        this.cylinderRenderPass.addUniform("jTrans", (gl, loc) => {
            gl.uniform3fv(loc, mesh.getBoneTranslations());
        });
        this.cylinderRenderPass.addUniform("jRots", (gl, loc) => {
            gl.uniform4fv(loc, mesh.getBoneRotations());
        });
        this.cylinderRenderPass.setDrawData(this.ctx.LINES, cylinderMesh.indices.length, this.ctx.UNSIGNED_INT, 0);
        this.cylinderRenderPass.setup();
    }
    initModel() {
        this.sceneRenderPass = new RenderPass(this.extVAO, this.ctx, sceneVSText, sceneFSText);
        const mesh = this.scene.meshes[0];
        this.useTexture = mesh.imgSrc !== null && mesh.imgSrc !== undefined;
        if (this.useTexture && mesh.imgSrc) {
            this.sceneRenderPass.addTextureMap(mesh.imgSrc.toString());
        }
        const faceCount = mesh.geometry.position.count / 3;
        const fIndices = new Uint32Array(faceCount * 3);
        for (let i = 0; i < faceCount * 3; i += 3) {
            fIndices[i] = i;
            fIndices[i + 1] = i + 1;
            fIndices[i + 2] = i + 2;
        }
        this.sceneRenderPass.setIndexBufferData(fIndices);
        this.sceneRenderPass.addAttribute("vertPosition", 3, this.ctx.FLOAT, false, 3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, mesh.geometry.position.values);
        this.sceneRenderPass.addAttribute("aNorm", 3, this.ctx.FLOAT, false, 3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, mesh.geometry.normal.values);
        if (mesh.geometry.uv) {
            this.sceneRenderPass.addAttribute("aUV", 2, this.ctx.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, mesh.geometry.uv.values);
        }
        else {
            this.sceneRenderPass.addAttribute("aUV", 2, this.ctx.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(mesh.geometry.normal.values.length));
        }
        this.sceneRenderPass.addAttribute("skinIndices", 4, this.ctx.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, mesh.geometry.skinIndex.values);
        this.sceneRenderPass.addAttribute("skinWeights", 4, this.ctx.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, mesh.geometry.skinWeight.values);
        this.sceneRenderPass.addAttribute("v0", 3, this.ctx.FLOAT, false, 3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, mesh.geometry.v0.values);
        this.sceneRenderPass.addAttribute("v1", 3, this.ctx.FLOAT, false, 3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, mesh.geometry.v1.values);
        this.sceneRenderPass.addAttribute("v2", 3, this.ctx.FLOAT, false, 3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, mesh.geometry.v2.values);
        this.sceneRenderPass.addAttribute("v3", 3, this.ctx.FLOAT, false, 3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, mesh.geometry.v3.values);
        this.sceneRenderPass.addUniform("lightPosition", (gl, loc) => {
            gl.uniform4fv(loc, this.lightPosition.xyzw);
        });
        this.sceneRenderPass.addUniform("mWorld", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(new Mat4().setIdentity().all()));
        });
        this.sceneRenderPass.addUniform("mProj", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().all()));
        });
        this.sceneRenderPass.addUniform("mView", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().all()));
        });
        this.sceneRenderPass.addUniform("jTrans", (gl, loc) => {
            gl.uniform3fv(loc, mesh.getBoneTranslations());
        });
        this.sceneRenderPass.addUniform("jRots", (gl, loc) => {
            gl.uniform4fv(loc, mesh.getBoneRotations());
        });
        this.sceneRenderPass.addUniform("uLambert", (gl, loc) => {
            gl.uniform1i(loc, this.useLambert ? 1 : 0);
        });
        this.sceneRenderPass.addUniform("baseColor", (gl, loc) => {
            gl.uniform3fv(loc, this.currentColor);
        });
        this.sceneRenderPass.addUniform("uUseTexture", (gl, loc) => {
            gl.uniform1i(loc, this.useTexture ? 1 : 0);
        });
        this.sceneRenderPass.addUniform("uSampler", (gl, loc) => {
            gl.uniform1i(loc, 0);
        });
        this.sceneRenderPass.addUniform("lightViewProj", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(this.lightViewProjMatrix.all()));
        });
        this.sceneRenderPass.addUniform("uUseShadow", (gl, loc) => {
            gl.uniform1i(loc, 1);
        });
        this.sceneRenderPass.addUniform("uShadowMap", (gl, loc) => {
            gl.uniform1i(loc, 1);
            if (this.shadowTexture) {
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
                gl.activeTexture(gl.TEXTURE0);
            }
        });
        this.sceneRenderPass.setDrawData(this.ctx.TRIANGLES, mesh.geometry.position.count, this.ctx.UNSIGNED_INT, 0);
        this.sceneRenderPass.setup();
    }
    initShadowPass() {
        this.shadowRenderPass = new RenderPass(this.extVAO, this.ctx, shadowVSText, shadowFSText);
        const mesh = this.scene.meshes[0];
        const faceCount = mesh.geometry.position.count / 3;
        const fIndices = new Uint32Array(faceCount * 3);
        for (let i = 0; i < faceCount * 3; i += 3) {
            fIndices[i] = i;
            fIndices[i + 1] = i + 1;
            fIndices[i + 2] = i + 2;
        }
        this.shadowRenderPass.setIndexBufferData(fIndices);
        this.shadowRenderPass.addAttribute("vertPosition", 3, this.ctx.FLOAT, false, 3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, mesh.geometry.position.values);
        this.shadowRenderPass.addAttribute("skinIndices", 4, this.ctx.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, mesh.geometry.skinIndex.values);
        this.shadowRenderPass.addAttribute("skinWeights", 4, this.ctx.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, mesh.geometry.skinWeight.values);
        this.shadowRenderPass.addAttribute("v0", 3, this.ctx.FLOAT, false, 3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, mesh.geometry.v0.values);
        this.shadowRenderPass.addAttribute("v1", 3, this.ctx.FLOAT, false, 3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, mesh.geometry.v1.values);
        this.shadowRenderPass.addAttribute("v2", 3, this.ctx.FLOAT, false, 3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, mesh.geometry.v2.values);
        this.shadowRenderPass.addAttribute("v3", 3, this.ctx.FLOAT, false, 3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, mesh.geometry.v3.values);
        this.shadowRenderPass.addUniform("mWorld", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(new Mat4().setIdentity().all()));
        });
        this.shadowRenderPass.addUniform("lightViewProj", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(this.lightViewProjMatrix.all()));
        });
        this.shadowRenderPass.addUniform("jTrans", (gl, loc) => {
            gl.uniform3fv(loc, mesh.getBoneTranslations());
        });
        this.shadowRenderPass.addUniform("jRots", (gl, loc) => {
            gl.uniform4fv(loc, mesh.getBoneRotations());
        });
        this.shadowRenderPass.setDrawData(this.ctx.TRIANGLES, mesh.geometry.position.count, this.ctx.UNSIGNED_INT, 0);
        this.shadowRenderPass.setup();
    }
    initLightMatrices() {
        const eye = new Vec3([this.lightPosition.x, this.lightPosition.y, this.lightPosition.z]);
        const target = new Vec3([0, 0, 0]);
        this.lightViewMatrix = Mat4.lookAt(eye, target, new Vec3([0, 1, 0]));
        this.lightProjMatrix = Mat4.orthographic(-15, 15, -15, 15, 1, 60);
        this.lightViewProjMatrix = this.lightProjMatrix.copy().multiply(this.lightViewMatrix);
    }
    initShadowResources() {
        const gl = this.ctx;
        this.shadowFramebuffer = gl.createFramebuffer();
        this.shadowTexture = gl.createTexture();
        this.shadowDepthBuffer = gl.createRenderbuffer();
        if (!this.shadowFramebuffer || !this.shadowTexture || !this.shadowDepthBuffer) {
            console.error("Failed to create shadow resources");
            return;
        }
        gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.shadowMapSize, this.shadowMapSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.shadowDepthBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.shadowMapSize, this.shadowMapSize);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFramebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.shadowTexture, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.shadowDepthBuffer);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    }
    initSkeleton() {
        this.skeletonRenderPass.setIndexBufferData(this.scene.meshes[0].getBoneIndices());
        this.skeletonRenderPass.addAttribute("vertPosition", 3, this.ctx.FLOAT, false, 3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].getBonePositions());
        this.skeletonRenderPass.addAttribute("boneIndex", 1, this.ctx.FLOAT, false, 1 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].getBoneIndexAttribute());
        this.skeletonRenderPass.addUniform("mWorld", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(Mat4.identity.all()));
        });
        this.skeletonRenderPass.addUniform("mProj", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().all()));
        });
        this.skeletonRenderPass.addUniform("selectedBoneIndex", (gl, loc) => {
            gl.uniform1f(loc, this.gui.selectedBone);
        });
        this.skeletonRenderPass.addUniform("mView", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().all()));
        });
        this.skeletonRenderPass.addUniform("bTrans", (gl, loc) => {
            gl.uniform3fv(loc, this.getScene().meshes[0].getBoneTranslations());
        });
        this.skeletonRenderPass.addUniform("bRots", (gl, loc) => {
            gl.uniform4fv(loc, this.getScene().meshes[0].getBoneRotations());
        });
        this.skeletonRenderPass.setDrawData(this.ctx.LINES, this.scene.meshes[0].getBoneIndices().length, this.ctx.UNSIGNED_INT, 0);
        this.skeletonRenderPass.setup();
    }
    initFloor() {
        this.floorRenderPass.setIndexBufferData(this.floor.indicesFlat());
        this.floorRenderPass.addAttribute("aVertPos", 4, this.ctx.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.floor.positionsFlat());
        this.floorRenderPass.addUniform("uLightPos", (gl, loc) => {
            gl.uniform4fv(loc, this.lightPosition.xyzw);
        });
        this.floorRenderPass.addUniform("uWorld", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(Mat4.identity.all()));
        });
        this.floorRenderPass.addUniform("uProj", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().all()));
        });
        this.floorRenderPass.addUniform("uView", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().all()));
        });
        this.floorRenderPass.addUniform("uProjInv", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().inverse().all()));
        });
        this.floorRenderPass.addUniform("uViewInv", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().inverse().all()));
        });
        this.floorRenderPass.addUniform("lightViewProj", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(this.lightViewProjMatrix.all()));
        });
        this.floorRenderPass.addUniform("uUseShadow", (gl, loc) => {
            gl.uniform1i(loc, 1);
        });
        this.floorRenderPass.addUniform("uShadowMap", (gl, loc) => {
            gl.uniform1i(loc, 1);
            if (this.shadowTexture) {
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
                gl.activeTexture(gl.TEXTURE0);
            }
        });
        this.floorRenderPass.setDrawData(this.ctx.TRIANGLES, this.floor.indicesFlat().length, this.ctx.UNSIGNED_INT, 0);
        this.floorRenderPass.setup();
    }
    renderShadowMap() {
        if (!this.shadowFramebuffer || this.scene.meshes.length === 0) {
            return;
        }
        const gl = this.ctx;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFramebuffer);
        gl.viewport(0, 0, this.shadowMapSize, this.shadowMapSize);
        gl.clearColor(1.0, 1.0, 1.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        this.shadowRenderPass.draw();
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    draw() {
        const curr = new Date().getTime();
        let deltaT = curr - this.millis;
        this.millis = curr;
        deltaT /= 1000;
        this.getGUI().incrementTime(deltaT);
        this.renderShadowMap();
        if (this.ctx2) {
            this.ctx2.clearRect(0, 0, this.ctx2.canvas.width, this.ctx2.canvas.height);
            if (this.scene.meshes.length > 0) {
                this.ctx2.fillText(this.getGUI().getModeString(), 50, 710);
            }
        }
        const gl = this.ctx;
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        const bg = this.backgroundColor;
        gl.clearColor(bg.r, bg.g, bg.b, bg.a);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);
        gl.frontFace(gl.CCW);
        gl.cullFace(gl.BACK);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.drawScene(0, 200, 800, 600);
        if (this.scene.meshes.length > 0) {
            gl.viewport(0, 0, 800, 200);
            this.sBackRenderPass.draw();
        }
    }
    drawScene(x, y, width, height) {
        const gl = this.ctx;
        gl.viewport(x, y, width, height);
        this.floorRenderPass.draw();
        if (this.scene.meshes.length > 0) {
            this.sceneRenderPass.draw();
            gl.disable(gl.DEPTH_TEST);
            this.skeletonRenderPass.draw();
            gl.enable(gl.DEPTH_TEST);
        }
    }
    getGUI() {
        return this.gui;
    }
    setScene(fileLocation) {
        this.loadedScene = fileLocation;
        this.useLambert = fileLocation.includes("mapped_cube");
        this.currentColor = this.useLambert ? this.lambertColor : this.defaultColor;
        this.useTexture = false;
        this.scene = new CLoader(fileLocation);
        this.scene.load(() => this.initScene());
    }
}
export function initializeCanvas() {
    const canvas = document.getElementById("glCanvas");
    const canvasAnimation = new SkinningAnimation(canvas);
    canvasAnimation.start();
    canvasAnimation.setScene("./static/assets/skinning/split_cube.dae");
}
//# sourceMappingURL=App.js.map