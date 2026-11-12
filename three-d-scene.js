(()=>{'use strict';
const canvas=document.querySelector('.table-3d-canvas');
if(!canvas)return;
const gl=canvas.getContext('webgl',{alpha:true,antialias:true,powerPreference:'low-power'});
if(!gl){canvas.dataset.error='webgl-unavailable';return;}
const vs=`attribute vec3 p;attribute vec3 c;uniform mat4 mvp;varying vec3 v;void main(){gl_Position=mvp*vec4(p,1.);v=c;}`;
const fs=`precision mediump float;varying vec3 v;void main(){gl_FragColor=vec4(v,1.);}`;
function shader(type,code){const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);
if(!gl.getProgramParameter(program,gl.LINK_STATUS))return;
gl.useProgram(program);
const pos=gl.createBuffer(),col=gl.createBuffer();
const locP=gl.getAttribLocation(program,'p'),locC=gl.getAttribLocation(program,'c'),locM=gl.getUniformLocation(program,'mvp');
const faces=[[0,1,2,0,2,3],[4,7,6,4,6,5],[0,4,5,0,5,1],[3,2,6,3,6,7],[1,5,6,1,6,2],[0,3,7,0,7,4]];
const normals=[[0,0,1],[0,0,-1],[0,1,0],[0,-1,0],[1,0,0],[-1,0,0]];
function cube(out,colors,x,y,z,w,h,d,faceColors){
 const v=[[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[.5,-.5,-.5]];
 const order=[[0,1,2,3],[4,5,6,7],[0,4,7,1],[3,2,6,5],[1,7,6,2],[0,3,5,4]];
 for(let f=0;f<6;f++){const fc=faceColors[f]||faceColors[0];for(const i of faces[f]){const a=order[f][i%4];out.push(x+v[a][0]*w,y+v[a][1]*h,z+v[a][2]*d);colors.push(fc[0],fc[1],fc[2]);}}
}
const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function mul(a,b){const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
function perspective(f,a,n,fz){const t=1/Math.tan(f/2);return [t/a,0,0,0,0,t,0,0,0,0,(fz+n)/(n-fz),-1,0,0,2*fz*n/(n-fz),0];}
function view(rx,ry){const cx=Math.cos(rx),sx=Math.sin(rx),cy=Math.cos(ry),sy=Math.sin(ry);const rX=[1,0,0,0,0,cx,sx,0,0,-sx,cx,0,0,0,0,1],rY=[cy,0,-sy,0,0,1,0,0,sy,0,cy,0,0,0,0,1],tr=identity();tr[14]=-6.1;return mul(mul(rY,rX),tr);}
let rotX=.34,rotY=0,drag=null,frame=0;
function draw(){
 const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
 const dpr=Math.min(devicePixelRatio||1,1.5),w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
 gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 const p=[],c=[],t=frame*.001;
 cube(p,c,0,0,-.12,4.8,2.85,.24,[[.055,.24,.18],[.035,.14,.11],[.12,.34,.26],[.035,.13,.1],[.08,.29,.21],[.025,.1,.08]]);
 // Gold raised perimeter rails
 cube(p,c,0,1.43,.015,4.85,.07,.08,Array(6).fill([.72,.52,.22]));
 cube(p,c,0,-1.43,.015,4.85,.07,.08,Array(6).fill([.72,.52,.22]));
 cube(p,c,-2.4,0,.015,.07,2.82,.08,Array(6).fill([.72,.52,.22]));
 cube(p,c,2.4,0,.015,.07,2.82,.08,Array(6).fill([.72,.52,.22]));
 // 3D card stacks at each seat and four animated cards in the trick area
 const ivory=[.96,.93,.84],edge=[.72,.68,.58],red=[.72,.12,.16],blue=[.12,.24,.43],dark=[.08,.12,.14];
 for(let seat=0;seat<4;seat++){const angle=seat*Math.PI/2,px=Math.cos(angle)*1.48,py=Math.sin(angle)*.86;for(let k=0;k<3;k++){const a=angle+(k-1)*.09;cube(p,c,px+Math.cos(a)*k*.025,py+Math.sin(a)*k*.025,.13+k*.025,.30,.46,.035,[ivory,edge,ivory,edge,edge,edge]);cube(p,c,px+Math.cos(a)*k*.025,py+Math.sin(a)*k*.025,.151+k*.025,.26,.42,.008,[seat%2?red:blue,dark,dark,dark,dark,dark]);}}
 for(let k=0;k<4;k++){const a=k*Math.PI/2+t*.0007;cube(p,c,Math.cos(a)*.31,Math.sin(a)*.22,.20+Math.sin(t*.003+k)*.025,.34,.49,.045,[ivory,edge,ivory,edge,edge,edge]);cube(p,c,Math.cos(a)*.31,Math.sin(a)*.22,.226+Math.sin(t*.003+k)*.025,.29,.44,.008,[k%2?red:blue,dark,dark,dark,dark,dark]);}
 gl.bindBuffer(gl.ARRAY_BUFFER,pos);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(p),gl.DYNAMIC_DRAW);gl.enableVertexAttribArray(locP);gl.vertexAttribPointer(locP,3,gl.FLOAT,false,0,0);
 gl.bindBuffer(gl.ARRAY_BUFFER,col);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(c),gl.DYNAMIC_DRAW);gl.enableVertexAttribArray(locC);gl.vertexAttribPointer(locC,3,gl.FLOAT,false,0,0);
 const m=mul(perspective(Math.PI/4,rect.width/rect.height,.1,40),view(rotX,rotY));gl.uniformMatrix4fv(locM,false,new Float32Array(m));gl.drawArrays(gl.TRIANGLES,0,p.length/3);
 frame++;requestAnimationFrame(draw);
}
const table=canvas.parentElement;
table.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,rx:rotX,ry:rotY};});
window.addEventListener('pointermove',e=>{if(!drag)return;rotY=drag.ry+(e.clientX-drag.x)*.008;rotX=Math.max(.08,Math.min(.72,drag.rx-(e.clientY-drag.y)*.006));});
window.addEventListener('pointerup',()=>drag=null);window.addEventListener('pointercancel',()=>drag=null);
if('ResizeObserver'in window)new ResizeObserver(()=>{}).observe(table);
requestAnimationFrame(draw);
})();