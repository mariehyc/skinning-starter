export const floorVSText = `
    precision mediump float;

    uniform vec4 uLightPos;
    uniform mat4 uWorld;
    uniform mat4 uView;
    uniform mat4 uProj;
    
    attribute vec4 aVertPos;

    varying vec4 vClipPos;

    void main () {

        gl_Position = uProj * uView * uWorld * aVertPos;
        vClipPos = gl_Position;
    }
`;

export const floorFSText = `
    precision mediump float;

    uniform mat4 uViewInv;
    uniform mat4 uProjInv;
    uniform vec4 uLightPos;

    varying vec4 vClipPos;

    void main() {
        vec4 wsPos = uViewInv * uProjInv * vec4(vClipPos.xyz/vClipPos.w, 1.0);
        wsPos /= wsPos.w;
        float checkerWidth = 5.0;
        float i = floor(wsPos.x / checkerWidth);
        float j = floor(wsPos.z / checkerWidth);
        vec3 color = mod(i + j, 2.0) * vec3(1.0, 1.0, 1.0);

        vec4 lightDirection = uLightPos - wsPos;
        float dot_nl = dot(normalize(lightDirection), vec4(0.0, 1.0, 0.0, 0.0));
	    dot_nl = clamp(dot_nl, 0.0, 1.0);
	
        gl_FragColor = vec4(clamp(dot_nl * color, 0.0, 1.0), 1.0);
    }
`;

export const sceneVSText = `
precision mediump float;
attribute vec3 vertPosition;
attribute vec2 aUV;
attribute vec3 aNorm;
attribute vec4 skinIndices;
attribute vec4 skinWeights;
attribute vec3 v0;
attribute vec3 v1;
attribute vec3 v2;
attribute vec3 v3;

varying vec4 lightDir;
varying vec2 uv;
varying vec4 normal;

uniform vec4 lightPosition;
uniform mat4 mWorld;
uniform mat4 mView;
uniform mat4 mProj;

uniform vec3 jTrans[64];
uniform vec4 jRots[64];
uniform bool uLambert;
uniform vec3 baseColor;

vec3 qtrans(vec4 q, vec3 v) {
    return v + 2.0 * cross(cross(v, q.xyz) - q.w*v, q.xyz);
}

void main() {
    vec3 skinnedPosition = vec3(0.0, 0.0, 0.0);
    
    int boneIndex0 = int(skinIndices.x);
    int boneIndex1 = int(skinIndices.y);
    int boneIndex2 = int(skinIndices.z);
    int boneIndex3 = int(skinIndices.w);
    
    vec3 transformed0 = jTrans[boneIndex0] + qtrans(jRots[boneIndex0], v0);
    skinnedPosition += skinWeights.x * transformed0;
    
    vec3 transformed1 = jTrans[boneIndex1] + qtrans(jRots[boneIndex1], v1);
    skinnedPosition += skinWeights.y * transformed1;
    
    vec3 transformed2 = jTrans[boneIndex2] + qtrans(jRots[boneIndex2], v2);
    skinnedPosition += skinWeights.z * transformed2;
    
    vec3 transformed3 = jTrans[boneIndex3] + qtrans(jRots[boneIndex3], v3);
    skinnedPosition += skinWeights.w * transformed3;
    
    vec4 worldPosition = mWorld * vec4(skinnedPosition, 1.0);
    gl_Position = mProj * mView * worldPosition;
  
    lightDir = lightPosition - worldPosition;
    
    normal = normalize(mWorld * vec4(aNorm, 0.0));
    uv = aUV;
}
`;

export const sceneFSText = `
    precision mediump float;

    varying vec4 lightDir;
    varying vec2 uv;
    varying vec4 normal;

    uniform bool uLambert;
    uniform vec3 baseColor;

    void main () {
        if (uLambert) {
            vec3 n = normalize(normal.xyz);
            vec3 l = normalize(lightDir.xyz);
            float diffuse = max(dot(n, l), 0.0);
            vec3 color = baseColor * diffuse;
            gl_FragColor = vec4(color, 1.0);
        } else {
            gl_FragColor = vec4((normal.x + 1.0)/2.0, (normal.y + 1.0)/2.0, (normal.z + 1.0)/2.0,1.0);
        }
    }
`;

export const skeletonVSText = `
    precision mediump float;

    attribute vec3 vertPosition;
    attribute float boneIndex;

    varying float boneindex;
    varying float selectedboneindex;

    uniform float selectedBoneIndex;
    
    uniform mat4 mWorld;
    uniform mat4 mView;
    uniform mat4 mProj;

    uniform vec3 bTrans[64];
    uniform vec4 bRots[64];

    vec3 qtrans(vec4 q, vec3 v) {
        return v + 2.0 * cross(cross(v, q.xyz) - q.w*v, q.xyz);
    }

    void main () {
        int index = int(boneIndex);
        gl_Position = mProj * mView * mWorld * vec4(bTrans[index] + qtrans(bRots[index], vertPosition), 1.0);
        boneindex = boneIndex;
        selectedboneindex = selectedBoneIndex;
    }
`;

export const skeletonFSText = ` 
    precision mediump float;

    varying float boneindex;
    varying float selectedboneindex;

    void main () {
        if (boneindex == selectedboneindex) {
            gl_FragColor = vec4(0.0, 1.0, 1.0, 1.0);
        }
        else {
            gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
        }
    }
`;

export const cylinderVSText = `
precision mediump float;
attribute vec3 vertPosition;
uniform mat4 mWorld;
uniform mat4 mView;
uniform mat4 mProj;
uniform vec3 jTrans[64];
uniform vec4 jRots[64];

vec3 qtransform(vec4 q, vec3 v) {
    return v + 2.0 * cross(cross(v, q.xyz) - q.w*v, q.xyz);
}

void main() {
    vec3 worldPos = jTrans[0] + qtransform(jRots[0], vertPosition);
    gl_Position = mProj * mView * mWorld * vec4(worldPos, 1.0);
}
`;

export const cylinderFSText = `
precision mediump float;
void main() {
    gl_FragColor = vec4(0.0, 1.0, 1.0, 1.0); 
}
`;

export const sBackVSText = `
    precision mediump float;

    attribute vec2 vertPosition;

    varying vec2 uv;

    void main() {
        gl_Position = vec4(vertPosition, 0.0, 1.0);
        uv = vertPosition;
        uv.x = (1.0 + uv.x) / 2.0;
        uv.y = (1.0 + uv.y) / 2.0;
    }
`;

export const sBackFSText = `
    precision mediump float;

    varying vec2 uv;

    void main () {
        gl_FragColor = vec4(0.1, 0.1, 0.1, 1.0);
        if (abs(uv.y-.33) < .005 || abs(uv.y-.67) < .005) {
            gl_FragColor = vec4(1, 1, 1, 1);
        }
    }
`;
