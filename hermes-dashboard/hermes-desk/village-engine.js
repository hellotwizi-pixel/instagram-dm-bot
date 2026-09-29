/* Small local WebGL scene renderer. Original mesh art; no network assets. */
(()=>{'use strict';
 const PI=Math.PI;
 const v3=(x=0,y=0,z=0)=>[x,y,z],sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l)};
 function mul(a,b){const r=new Float32Array(16);for(let c=0;c<4;c++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)r[c*4+row]+=a[k*4+row]*b[c*4+k];return r}
 function model(x=0,y=0,z=0,scale=1,rot=0){const c=Math.cos(rot)*scale,s=Math.sin(rot)*scale;return new Float32Array([c,0,-s,0,0,scale,0,0,s,0,c,0,x,y,z,1])}
 function look(eye,target){const z=norm(sub(eye,target)),x=norm(cross([0,1,0],z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1])}
 function ortho(w,h){return new Float32Array([1/w,0,0,0,0,1/h,0,0,0,0,-2/150,0,0,0,-1,1])}
 const color=s=>{const n=parseInt(s.replace('#',''),16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]};
 class MeshBuilder{
  constructor(){this.data=[]}
  tri(a,b,c,col){const n=norm(cross(sub(b,a),sub(c,a))),k=typeof col==='string'?color(col):col;for(const p of [a,b,c])this.data.push(...p,...n,...k)}
  quad(a,b,c,d,col){this.tri(a,b,c,col);this.tri(a,c,d,col)}
  box(x,y,z,w,h,d,col,rot=0){const c=Math.cos(rot),s=Math.sin(rot),p=(a,b,e)=>[x+a*c+e*s,y+b,z-a*s+e*c],X=w/2,Y=h/2,Z=d/2;const a=p(-X,-Y,Z),b=p(X,-Y,Z),c1=p(X,Y,Z),d1=p(-X,Y,Z),e=p(-X,-Y,-Z),f=p(X,-Y,-Z),g=p(X,Y,-Z),h1=p(-X,Y,-Z);this.quad(a,b,c1,d1,col);this.quad(f,e,h1,g,col);this.quad(e,a,d1,h1,col);this.quad(b,f,g,c1,col);this.quad(d1,c1,g,h1,col);this.quad(e,f,b,a,col)}
  ellipsoid(x,y,z,rx,ry,rz,col,segments=10,rings=7){const point=(i,j)=>{const a=i/rings*PI,b=j/segments*PI*2;return[x+rx*Math.sin(a)*Math.cos(b),y+ry*Math.cos(a),z+rz*Math.sin(a)*Math.sin(b)]};for(let i=0;i<rings;i++)for(let j=0;j<segments;j++)this.quad(point(i,j),point(i,j+1),point(i+1,j+1),point(i+1,j),col)}
  cylinder(x,y,z,r,h,col,n=12,topR=r){for(let i=0;i<n;i++){const a=i/n*PI*2,b=(i+1)/n*PI*2,p=(ang,rr,yy)=>[x+Math.cos(ang)*rr,yy,z+Math.sin(ang)*rr];this.quad(p(a,r,y),p(a,topR,y+h),p(b,topR,y+h),p(b,r,y),col);this.tri([x,y+h,z],p(b,topR,y+h),p(a,topR,y+h),col);this.tri([x,y,z],p(a,r,y),p(b,r,y),col)}}
  roof(x,y,z,w,h,d,col){const a=[x-w/2,y,z-d/2],b=[x+w/2,y,z-d/2],c=[x+w/2,y,z+d/2],d1=[x-w/2,y,z+d/2],e=[x,y+h,z-d/2],f=[x,y+h,z+d/2];this.quad(a,d1,f,e,col);this.quad(e,f,c,b,col);this.tri(a,e,b,col);this.tri(d1,c,f,col)}
 }
 class Engine{
  constructor(canvas){this.canvas=canvas;const gl=canvas.getContext('webgl',{antialias:true,alpha:true,powerPreference:'low-power'});if(!gl)throw Error('3D 화면을 사용할 수 없는 환경');this.gl=gl;this.resources=[];this.camera={angle:.22,zoom:1,x:0,z:0};this.target={...this.camera};this.time=0;this.width=1;this.height=1;
   const vertex=`attribute vec3 p;attribute vec3 n;attribute vec3 c;uniform mat4 vp;uniform mat4 m;varying vec3 rgb;void main(){vec3 normal=normalize(mat3(m)*n);float key=max(dot(normal,normalize(vec3(-.45,.85,.5))),0.);float sky=normal.y*.12;rgb=c*(.73+key*.3+sky);gl_Position=vp*m*vec4(p,1.);}`;
   const fragment=`precision mediump float;varying vec3 rgb;void main(){gl_FragColor=vec4(rgb,1.);}`;
   const shader=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('3D 초기화 실패');return s};const vs=shader(gl.VERTEX_SHADER,vertex),fs=shader(gl.FRAGMENT_SHADER,fragment),program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('3D 연결 실패');this.program=program;this.loc={p:gl.getAttribLocation(program,'p'),n:gl.getAttribLocation(program,'n'),c:gl.getAttribLocation(program,'c'),m:gl.getUniformLocation(program,'m'),vp:gl.getUniformLocation(program,'vp')};gl.useProgram(program);gl.enable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);this.vp=new Float32Array(16);
  }
  mesh(builder){const gl=this.gl,b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(builder.data),gl.STATIC_DRAW);const obj={buffer:b,count:builder.data.length/9};this.resources.push(obj);return obj}
  delete(mesh){if(!mesh)return;this.gl.deleteBuffer(mesh.buffer);this.resources=this.resources.filter(x=>x!==mesh)}
  begin(time){this.time=time;const gl=this.gl,rect=this.canvas.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,1.65);this.width=rect.width;this.height=rect.height;if(this.canvas.width!==Math.round(rect.width*ratio)||this.canvas.height!==Math.round(rect.height*ratio)){this.canvas.width=Math.round(rect.width*ratio);this.canvas.height=Math.round(rect.height*ratio)}gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);for(const key of ['angle','zoom','x','z'])this.camera[key]+=(this.target[key]-this.camera[key])*.09;const a=this.camera.angle,eye=[this.camera.x+Math.sin(a)*44,37,this.camera.z+Math.cos(a)*44],target=[this.camera.x,0,this.camera.z];let h=18.5/this.camera.zoom;const aspect=rect.width/Math.max(rect.height,1);if(aspect<1.65)h*=1.65/aspect;this.vp=mul(ortho(h*aspect,h),look(eye,target));gl.useProgram(this.program);gl.uniformMatrix4fv(this.loc.vp,false,this.vp)}
  draw(mesh,m=model()){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);for(const [key,offset]of [['p',0],['n',12],['c',24]]){gl.enableVertexAttribArray(this.loc[key]);gl.vertexAttribPointer(this.loc[key],3,gl.FLOAT,false,36,offset)}gl.uniformMatrix4fv(this.loc.m,false,m);gl.drawArrays(gl.TRIANGLES,0,mesh.count)}
  project(x,y,z){const p=[x,y,z,1],v=[0,0,0,0];for(let row=0;row<4;row++)for(let k=0;k<4;k++)v[row]+=this.vp[k*4+row]*p[k];return {x:(v[0]/v[3]+1)*this.width/2,y:(1-v[1]/v[3])*this.height/2,visible:v[2]/v[3]>-1&&v[2]/v[3]<1}}
  dispose(){this.resources.forEach(m=>this.gl.deleteBuffer(m.buffer));this.gl.deleteProgram(this.program)}
 }
 function animal(spec={}){const b=new MeshBuilder(),fur=spec.fur||'#ca9976',shirt=spec.shirt||'#76a5bc',kind=spec.kind||'bear';
  b.ellipsoid(0,.68,0,.4,.47,.3,shirt);b.ellipsoid(0,1.3,.04,.46,.42,.39,fur,12,9);
  if(kind==='rabbit'){b.ellipsoid(-.22,1.92,0,.12,.39,.12,fur);b.ellipsoid(.22,1.92,0,.12,.39,.12,fur);b.ellipsoid(-.22,1.93,.1,.058,.25,.035,'#e8aba2');b.ellipsoid(.22,1.93,.1,.058,.25,.035,'#e8aba2')}
  else if(kind==='cat'){b.roof(-.28,1.55,.01,.28,.36,.25,fur);b.roof(.28,1.55,.01,.28,.36,.25,fur)}
  else{b.ellipsoid(-.33,1.64,-.025,.19,.2,.15,fur);b.ellipsoid(.33,1.64,-.025,.19,.2,.15,fur);b.ellipsoid(-.33,1.65,.1,.1,.12,.05,'#e9b8a0');b.ellipsoid(.33,1.65,.1,.1,.12,.05,'#e9b8a0')}
  b.ellipsoid(0,1.16,.363,.21,.15,.095,'#f8e9d3');b.ellipsoid(0,1.23,.454,.075,.045,.037,'#684e43');
  for(const s of [-1,1]){b.ellipsoid(s*.19,1.36,.377,.034,.052,.025,'#3b423f',8,6);b.ellipsoid(s*.28,1.19,.337,.075,.035,.028,'#eaa59b',8,5)}
  b.box(0,.77,.305,.22,.2,.025,'#f8ead0');b.ellipsoid(0,.4,-.26,.18,.16,.2,fur);return b;
 }
 window.Village3D={Engine,MeshBuilder,animal,model,mul};
})();
