"use strict";

/* ספריית האייקונים של האפליקציה: שטוחים, בלי קו מתאר, בשפה של הדמות. עיניים הן נקודות כהות, ונקודות אור לבנות.
   האייקונים הגדולים (סיפורים ורעיונות) עם קצוות קצת לא ישרים, כמו ציור ביד. העיצוב והתצוגה המלאה: design/rows.html.
   כל אייקון מצויר בפעם הראשונה שמבקשים אותו, ונשמר */

(() => {
const IDEAS=[["🍦","גלידה","#ffe1ec"],["🦄","חד קרן","#efe2ff"],["🦖","דינוזאור","#dff5e3"],["🚀","חללית","#e1ecff"],["🐱","חתול","#fff0d6"],["🧜‍♀️","בת ים","#d9f4f6"],["🐉","דרקון","#e6f7d9"],["🏴‍☠️","פיראטים","#ececec"],["🌈","קשת","#fff6cf"],["🎂","יום הולדת","#ffe4dc"],["🚒","כבאית","#ffdcdc"],["🐶","כלב","#f6ead9"],["🧚","פיה","#f8e3ff"],["🤖","רובוט","#e3e8ef"],["🍕","פיצה","#fff0d0"],["🌊","ים","#d8ecff"]];
const rnd=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v)};
const PLUM="#2b1f4a", NS="http://www.w3.org/2000/svg";
const scratch=document.createElementNS(NS,"svg"); scratch.style.cssText="position:absolute;width:0;height:0"; document.body.appendChild(scratch);
/* דוגם את הקו, מזיז כל נקודה קצת, ומחבר בחזרה בעקומה חלקה */
function wobble(d,seed,amp,closed=true,step=3.2){
  const p=document.createElementNS(NS,"path"); p.setAttribute("d",d); scratch.appendChild(p);
  const L=p.getTotalLength(), n=Math.max(closed?10:3,Math.round(L/step)), pts=[];
  for(let i=0;i<(closed?n:n+1);i++){const q=p.getPointAtLength(i/n*L), j=closed||(i>0&&i<n)?1:.3; pts.push([q.x+(rnd(seed+i)-.5)*amp*j,q.y+(rnd(seed+i+77)-.5)*amp*j]);}
  p.remove();
  const P=i=>closed?pts[(i+pts.length)%pts.length]:pts[Math.max(0,Math.min(pts.length-1,i))];
  let out=`M${P(0)[0].toFixed(2)} ${P(0)[1].toFixed(2)}`, m=closed?pts.length:pts.length-1;
  for(let i=0;i<m;i++){const a=P(i-1),b=P(i),c=P(i+1),e=P(i+2);
    out+=`C${(b[0]+(c[0]-a[0])/6).toFixed(2)} ${(b[1]+(c[1]-a[1])/6).toFixed(2)} ${(c[0]-(e[0]-b[0])/6).toFixed(2)} ${(c[1]-(e[1]-b[1])/6).toFixed(2)} ${c[0].toFixed(2)} ${c[1].toFixed(2)}`;}
  return out+(closed?"Z":"");
}
/* אייקון שטוח: צורות צבועות בלי קו מתאר, כמו הדמות עצמה. פרטים קטנים (שורות, קרניים) הם קווים בגוון של הצורה,
   ונקודות אור לבנות. הקצוות רועדים קצת, וכל אייקון מתחלף בין 3 פריימים */
function drawIcon(layers,seed,{frames=3,amp=1}={}){
  let out="";
  for(let f=0;f<frames;f++){
    let g="";
    layers.forEach((L,k)=>{const sd=seed+f*500+k*37;
      const W2=(d,a,closed=true)=>a===0?d:wobble(d,sd,a,closed);
      if(L.open) g+=`<path d="${W2(L.d,amp*.8,false)}" fill="none" stroke="${L.color}" stroke-width="${L.sw||2.6}" stroke-linecap="round"/>`;
      else g+=`<path d="${amp===0?L.d:L.d.split(/(?=M)/).map((part,j)=>wobble(part,sd+j*13,L.amp??amp)).join("")}" fill="${L.fill}"/>`;
      if(L.dots) g+=L.dots.map(([x,y,r],i)=>`<circle cx="${x+(amp?(rnd(sd+i)-.5)*.6:0)}" cy="${y+(amp?(rnd(sd+i+9)-.5)*.6:0)}" r="${r}" fill="#fff" opacity=".8"/>`).join("");
    });
    out+=frames>1?`<g class="f${f}">${g}</g>`:g;
  }
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${out}</svg>`;
}
const C=(x,y,r)=>`M${x-r} ${y}A${r} ${r} 0 1 0 ${x+r} ${y}A${r} ${r} 0 1 0 ${x-r} ${y}Z`;
const eye=(x,y,r=2.2)=>({d:C(x,y,r),fill:"#2b1f4a",amp:.15});
const STORY_ICONS=[
  /* ינשוף */ [{d:"M12 21C12 12 17 8 24 8C31 8 36 12 36 21L36 33C36 40 31 43 24 43C17 43 12 40 12 33Z",fill:"#6f5fd0"},{d:"M12.5 15L11.5 5.5L19.5 10Z",fill:"#6f5fd0"},{d:"M35.5 15L36.5 5.5L28.5 10Z",fill:"#6f5fd0"},
             {d:"M17 31C17 26 20 24 24 24C28 24 31 26 31 31C31 37 28 40 24 40C20 40 17 37 17 31Z",fill:"#c9c2ff",dots:[[21,30,1],[26,33,1],[22,36,1]]},{d:C(18.5,17.5,5.2),fill:"#fff",amp:.4},{d:C(29.5,17.5,5.2),fill:"#fff",amp:.4},eye(19.2,18),eye(30.2,18),{d:"M22 21.5L26 21.5L24 25.5Z",fill:"#ffb340",amp:.3}],
  /* דינוזאור רוקד בטוטו */ [{d:"M9 37C9 29 15 25 22 25L29 25L30 12C30 8 33 5.5 36.5 6C40 6.5 41.5 9.5 40.5 12.5L37 14L36 28C36 34 33 37 28 37Z",fill:"#3fb58a",dots:[[33,10,1.4]]},{d:"M5 30L10 33L8 37Z",fill:"#3fb58a"},
             {d:"M13 30L35 30L39 36.5L9 36.5Z",fill:"#ffffff",dots:[]},{d:"M16 37L18 44L21 44L21 37ZM27 37L27 44L30 44L32 37Z",fill:"#3fb58a"},eye(36.5,9.5,1.6)],
  /* ירח */ [{d:"M31 7C21 8 14 15.5 14 24.5C14 33.5 21 41 31 41C24.5 37.5 20.5 31.5 20.5 24.5C20.5 17.5 24.5 11 31 7Z",fill:"#fff6d6",dots:[[18,27,1.2]]},
             {d:"M35 13L36.2 16L39.3 16.2L36.9 18.2L37.7 21.3L35 19.6L32.3 21.3L33.1 18.2L30.7 16.2L33.8 16Z",fill:"#ffffff"},{d:C(38,30,1.6),fill:"#ffffff",amp:.2},{d:C(30,34,1.1),fill:"#ffffff",amp:.2}],
  /* אוטובוס */ [{d:"M7 15C7 11.5 9 10 12.5 10L36 10C39 10 41 12 41 15.5L41 33C41 35 40 36 38 36L10 36C8 36 7 35 7 33Z",fill:"#ffd54f",dots:[[11,13,1.2]]},
             {d:"M11 15L19 15L19 23L11 23ZM22 15L29 15L29 23L22 23ZM32 15L37.5 15L37.5 23L32 23Z",fill:"#ffffff"},{d:"M7 27L41 27L41 29L7 29Z",fill:"#ffb340",amp:.3},{d:C(15,36,4.2),fill:"#2b1f4a",amp:.3},{d:C(33,36,4.2),fill:"#2b1f4a",amp:.3},{d:C(15,36,1.5),fill:"#c9c2ff",amp:.1},{d:C(33,36,1.5),fill:"#c9c2ff",amp:.1}],
  /* גלידה */ [{d:"M16.5 24L31.5 24L24 44Z",fill:"#f5b85a"},{d:C(19,21,7),fill:"#ff9ec4",dots:[[16,18,1.4]]},{d:C(29,21,7),fill:"#fff4d6"},{d:C(24,13.5,7),fill:"#c9b5f6",dots:[[21,11,1.4]]},{d:C(24,5.5,2.4),fill:"#ff5a6e",amp:.3}],
  /* ארנבון בחלל */ [{d:"M17 4C14 4 13.5 14 16.5 20L21.5 19C22 12 20.5 4 17 4Z",fill:"#ffffff"},{d:"M31 4C34 4 34.5 14 31.5 20L26.5 19C26 12 27.5 4 31 4Z",fill:"#ffffff"},{d:"M17.4 8C16.4 9 16.4 14 17.6 17L19.6 16.7C19.8 13 19.4 9 17.4 8Z",fill:"#ffc2d4"},
             {d:C(24,28,11),fill:"#ffffff"},eye(20,26.5),eye(28,26.5),{d:"M22.5 30.5L25.5 30.5L24 32.5Z",fill:"#ff8fb1",amp:.2},{d:"M41 7L42 9.5L44.5 10L42 11L41 13.5L40 11L37.5 10L40 9.5Z",fill:"#fff6d6"},{d:C(7,38,1.6),fill:"#fff6d6",amp:.2}],
  /* דג */ [{d:"M7 24C13 14 25 12.5 33 24C25 35.5 13 34 7 24Z",fill:"#ff9d5c",dots:[[13,21,1.3]]},{d:"M32 24L43 15.5L41 24L43 32.5Z",fill:"#ff9d5c"},{d:"M18 15.5C20.5 20 20.5 28 18 32.5L21.5 32.5C24 28 24 20 21.5 15.5Z",fill:"#ffffff"},eye(13,22.5,2),{d:C(6,15,1.8),fill:"#ffffff",amp:.2},{d:C(4,9,1.2),fill:"#ffffff",amp:.2}],
  /* כתר */ [{d:"M7 35L9 13L17.5 22L24 9L30.5 22L39 13L41 35Z",fill:"#ffe066",dots:[[12,30,1.3]]},{d:"M7 35L41 35L41 40L7 40Z",fill:"#ffc93c",amp:.4},{d:C(24,29,3),fill:"#ff6f9a",amp:.3},{d:C(15,30,2.2),fill:"#5cc0f5",amp:.3},{d:C(33,30,2.2),fill:"#5cc0f5",amp:.3},{d:C(9,12,2),fill:"#ffe066",amp:.2},{d:C(24,8,2),fill:"#ffe066",amp:.2},{d:C(39,12,2),fill:"#ffe066",amp:.2}],
  /* צב */ [{d:C(41,27,5),fill:"#9be0a7"},eye(42.5,25.5,1.4),{d:"M12 34L16 34L16 40L12 40ZM31 34L35 34L35 40L31 40Z",fill:"#9be0a7"},{d:"M7 35C7 22 14 14 23.5 14C33 14 40 22 40 35Z",fill:"#4cbf7d",dots:[[15,22,1.5]]},
             {d:C(23.5,25,4.5),fill:"#7fd69a",amp:.4},{d:C(14.5,30.5,3),fill:"#7fd69a",amp:.3},{d:C(32.5,30.5,3),fill:"#7fd69a",amp:.3}],
  /* שן וחיידק */ [{d:"M10 13C10 8 14 6.5 18 7.5C20 8 23 8.5 25 7.5C29 6.5 33 8 33 13C33 19 31 23 30 29C29 36 27.5 40 25.5 40C23.5 40 23.5 32 21.5 32C19.5 32 19.5 40 17.5 40C15.5 40 14 36 13 29C12 23 10 19 10 13Z",fill:"#ffffff",dots:[]},
             {d:"M15 12C15 10.5 16.5 10 18 10.5",fill:"none"},{d:"M33 33C33 29 36 27 39.5 27C43 27 45 29.5 45 33C45 37 42.5 39.5 39 39.5C35.5 39.5 33 37 33 33Z",fill:"#8fdc6f"},eye(37.3,32,1.3),eye(41.3,32,1.3),{d:"M37.6 35.4Q39.5 37.4 41.4 35.4L41.4 36.4Q39.5 38.6 37.6 36.4Z",fill:"#2b1f4a",amp:.05},
             {d:"M7 6L8 8.5L10.5 9.5L8 10.5L7 13L6 10.5L3.5 9.5L6 8.5Z",fill:"#ffffff"}],
];
const P="#2b1f4a", star=(x,y,r,fill)=>{let d="";for(let k=0;k<10;k++){const a=-Math.PI/2+k*Math.PI/5, rr=k%2?r*.45:r; d+=(k?"L":"M")+(x+Math.cos(a)*rr).toFixed(2)+" "+(y+Math.sin(a)*rr).toFixed(2);} return {d:d+"Z",fill,amp:.25};};
const IDEA_ICONS={
  "גלידה":STORY_ICONS[4],
  "חד קרן":[{d:"M13 42C12 33 14.5 25 19.5 20C21.5 14.5 26 11.5 31 12.5C35.5 13.5 37.5 17.5 36.5 21.5L38.5 28.5C39.5 31.5 36.5 33.5 33.5 31.5L29.5 29.5C27.5 33.5 27.5 38 28.5 42Z",fill:"#ffffff",dots:[]},
            {d:"M29.5 12.8L35 1.5L33.6 13.8Z",fill:"#ffd54f",amp:.3},{d:"M26.5 13L27.5 6.5L31 11.5Z",fill:"#ffffff",amp:.3},
            {d:"M21 19.5C17 16.5 12.5 19.5 13.5 24.5C10.5 26 10.5 31.5 12.5 34C12.5 30 15 27.5 17.5 27.5C16.5 24 18.5 21.5 21.5 21.5Z",fill:"#c9b5f6"},{d:"M23 15.5C20 13 17 14 16.5 17C19 16 21 16.5 22.5 18Z",fill:"#ff9ec4",amp:.3},
            eye(31,20,1.8),{d:C(36,27.5,1.6),fill:"#ffc2d4",amp:.2}],
  "דינוזאור":STORY_ICONS[1].filter((L,i)=>i!==2),
  "חללית":[{d:"M24 3C30.5 8.5 32.5 17 31.5 29L16.5 29C15.5 17 17.5 8.5 24 3Z",fill:"#ffffff",dots:[[20.5,12,1.2]]},{d:"M16.5 21L10 32L16.5 30.5ZM31.5 21L38 32L31.5 30.5Z",fill:"#ff6f6f"},
            {d:C(24,17,4.6),fill:"#5cc0f5",amp:.3},{d:C(22.6,15.6,1.3),fill:"#ffffff",amp:.1},{d:"M18.5 30.5L29.5 30.5L24 44Z",fill:"#ffb340"},{d:"M21 30.5L27 30.5L24 38Z",fill:"#ffe066",amp:.3}],
  "חתול":[{d:"M9.5 23L10.5 7.5L19 14C22 13 26 13 29 14L37.5 7.5L38.5 23C39.5 32 33 39 24 39C15 39 8.5 32 9.5 23Z",fill:"#ffb062",dots:[[15,18,1.4]]},
          {d:"M12.5 11L13 16.5L16.5 13.5Z",fill:"#ffd9b0",amp:.2},{d:"M35.5 11L35 16.5L31.5 13.5Z",fill:"#ffd9b0",amp:.2},
          eye(18.5,23,2.1),eye(29.5,23,2.1),{d:"M22.3 28L25.7 28L24 30Z",fill:"#ff7f9e",amp:.15},
          {d:"M8 27L15 28",open:true,color:"#e08a3c",sw:1.6},{d:"M8.5 31.5L15 30.5",open:true,color:"#e08a3c",sw:1.6},{d:"M40 27L33 28",open:true,color:"#e08a3c",sw:1.6},{d:"M39.5 31.5L33 30.5",open:true,color:"#e08a3c",sw:1.6}],
  "בת ים":[ /* זנב של בת ים שיוצא מהמים, עם סנפיר גדול למעלה */
          {d:"M16.5 41C15.5 32.5 18.5 25 24.5 19.5L29 15L32.5 18.5L29 23C25 28.5 24 34.5 26 41Z",fill:"#4fd1a5",dots:[[22,30,1.2],[25,25,1.2],[21,36,1.1]]},
          {d:"M30.5 16.5C27 9 22.5 6 17.5 6.5C21.5 9.5 24 13 27.5 18Z",fill:"#2fb48a"},{d:"M30.5 16.5C34 9 38.5 5.5 43.5 6C40 10 36.5 13.5 33 18.5Z",fill:"#2fb48a"},
          {d:"M3 39C7 35.5 11 35.5 15 39C19 42.5 23 42.5 27 39C31 35.5 35 35.5 39 39C41 40.5 43 40.5 45 39L45 46L3 46Z",fill:"#5cc0f5"},
          {d:C(9,14,2),fill:"#ffffff",amp:.2},{d:C(12,21,1.3),fill:"#ffffff",amp:.2},{d:C(38,28,1.3),fill:"#ffffff",amp:.2}],
  "דרקון":[{d:"M9 39C9 31 15 27 22 27L29 27L30 14C30 10 33 7.5 36.5 8C40 8.5 41.5 11.5 40.5 14.5L37 16L36 30C36 36 33 39 28 39Z",fill:"#8f7ae8",dots:[[33,12,1.4]]},{d:"M5 32L10 35L8 39Z",fill:"#8f7ae8"},
          {d:"M21 28L17 15L28 23Z",fill:"#c9b5f6"},{d:"M29.5 16L32 13L32.5 17.5ZM29.5 21L32 18L32.5 22.5Z",fill:"#ffd54f",amp:.2},
          {d:"M16 39L18 45L21 45L21 39ZM27 39L27 45L30 45L32 39Z",fill:"#8f7ae8"},eye(36.5,11.5,1.6),{d:"M41 13.5C44 11 46.5 12.5 46.5 14.5C45 13.5 43 14 41.5 15Z",fill:"#ffb340",amp:.2}],
  "פיראטים":[{d:"M5 30L43 30L37.5 40L10.5 40Z",fill:"#b06e3e",dots:[[12,33,1.2]]},{d:"M23 7L25 7L25 30L23 30Z",fill:"#8a5430",amp:.2},
             {d:"M25.5 9L38.5 26.5L25.5 26.5Z",fill:"#ffffff"},{d:"M22.5 11.5L11.5 26.5L22.5 26.5Z",fill:"#ffffff"},{d:"M25 3.5L32 6L25 8.5Z",fill:P,amp:.2},
             {d:"M3 42C7 39.5 11 39.5 15 42C19 44.5 23 44.5 27 42C31 39.5 35 39.5 39 42C41 43 43 43 45 42L45 46L3 46Z",fill:"#5cc0f5"}],
  "קשת":[{d:"M7 35A17 17 0 0 1 41 35",open:true,color:"#ff6f6f",sw:4.4},{d:"M11.5 35A12.5 12.5 0 0 1 36.5 35",open:true,color:"#ffd54f",sw:4.4},{d:"M16 35A8 8 0 0 1 32 35",open:true,color:"#4fd1a5",sw:4.4},
         {d:C(8,36,4),fill:"#ffffff",amp:.3},{d:C(12.5,37.5,3.3),fill:"#ffffff",amp:.3},{d:C(40,36,4),fill:"#ffffff",amp:.3},{d:C(35.5,37.5,3.3),fill:"#ffffff",amp:.3}],
  "יום הולדת":[{d:"M9 26L39 26L39 41L9 41Z",fill:"#ffd9a0",dots:[[14,35,1.1],[24,37,1.1],[33,34,1.1]]},
              {d:"M9 26C9 22 12 21 24 21C36 21 39 22 39 26L39 30C36 30.5 35 33 32 30C29 33 27 30 24 32C21 30 19 33 16 30C13 33 12 30.5 9 30Z",fill:"#ff9ec4",dots:[[13,24,1.2]]},
              {d:"M17 12L19.6 12L19.6 21L17 21ZM28.4 12L31 12L31 21L28.4 21Z",fill:"#5cc0f5",amp:.2},{d:"M18.3 5C20.3 7.5 20.3 10 18.3 11C16.3 10 16.3 7.5 18.3 5Z",fill:"#ffb340",amp:.2},{d:"M29.7 5C31.7 7.5 31.7 10 29.7 11C27.7 10 27.7 7.5 29.7 5Z",fill:"#ffb340",amp:.2}],
  "כבאית":[{d:"M4 18L28 18L28 35L4 35Z",fill:"#ff5a5a",dots:[[7,21,1.2]]},{d:"M28 22L36 22L43 29L43 35L28 35Z",fill:"#ff5a5a"},{d:"M30 24L35 24L39.5 29L30 29Z",fill:"#ffffff",amp:.3},
          {d:"M6 13L27 13L27 15.5L6 15.5Z",fill:"#ffffff",amp:.2},{d:"M10 12L10 16.5M15 12L15 16.5M20 12L20 16.5",open:true,color:"#ffffff",sw:1.6},{d:"M32 18.5L36 18.5L36 22L32 22Z",fill:"#5cc0f5",amp:.2},
          {d:C(12,36,4.2),fill:P,amp:.3},{d:C(34,36,4.2),fill:P,amp:.3},{d:C(12,36,1.5),fill:"#c9c2ff",amp:.1},{d:C(34,36,1.5),fill:"#c9c2ff",amp:.1}],
  "כלב":[{d:"M13 18C13 11 18 8 24 8C30 8 35 11 35 18L35 27C35 34 30 38.5 24 38.5C18 38.5 13 34 13 27Z",fill:"#f2c17d",dots:[[17,14,1.3]]},
         {d:"M13.5 13.5C8 13.5 5.5 20 7.5 27.5C9.5 29 12 27 13.5 23.5Z",fill:"#a8673b"},{d:"M34.5 13.5C40 13.5 42.5 20 40.5 27.5C38.5 29 36 27 34.5 23.5Z",fill:"#a8673b"},
         {d:"M17.5 28C17.5 24 20.5 22.5 24 22.5C27.5 22.5 30.5 24 30.5 28C30.5 32 27.5 34.5 24 34.5C20.5 34.5 17.5 32 17.5 28Z",fill:"#fff4d6"},
         eye(19,19.5,2),eye(29,19.5,2),{d:C(24,25.5,2.4),fill:P,amp:.15},{d:"M22.3 30L25.7 30L25.7 33C25.7 34.5 22.3 34.5 22.3 33Z",fill:"#ff8fb1",amp:.15}],
  "פיה":[{d:"M9 43L28.5 20.5L31 22.5L11.5 45Z",fill:"#c9b5f6",amp:.3},star(31,15,10.5,"#ffe066"),{d:C(28.5,12.5,1.4),fill:"#ffffff",amp:.1},
         star(10,12,3.4,"#ffffff"),star(42,30,2.8,"#ffffff"),{d:C(17,24,1.3),fill:"#ffffff",amp:.1},{d:C(38,6,1.3),fill:"#ffffff",amp:.1}],
  "רובוט":[{d:"M23 5L25 5L25 12L23 12Z",fill:"#8e9ab0",amp:.2},{d:C(24,5,2.6),fill:"#ff6f6f",amp:.2},{d:"M11 13C11 11.5 12 11 13.5 11L34.5 11C36 11 37 11.5 37 13L37 33C37 35 36 35.5 34.5 35.5L13.5 35.5C12 35.5 11 35 11 33Z",fill:"#b8c4d6",dots:[[14.5,14.5,1.3]]},
          {d:"M7.5 19L11 19L11 27L7.5 27ZM37 19L40.5 19L40.5 27L37 27Z",fill:"#8e9ab0",amp:.2},{d:C(18.5,21,4.2),fill:"#ffffff",amp:.3},{d:C(29.5,21,4.2),fill:"#ffffff",amp:.3},eye(19,21.5,2),eye(30,21.5,2),
          {d:"M17 28.5L31 28.5L31 32L17 32Z",fill:"#ffffff",amp:.2},{d:"M20.5 28.5L20.5 32M24 28.5L24 32M27.5 28.5L27.5 32",open:true,color:"#b8c4d6",sw:1.3}],
  "פיצה":[{d:"M8.5 12C18 8 30 8 39.5 12L24 44Z",fill:"#ffd54f"},{d:"M7 9C18 4 30 4 41 9L39.8 13.5C30 9.5 18 9.5 8.2 13.5Z",fill:"#e6a04c",amp:.6},
          {d:C(19,18,3.2),fill:"#ff6f6f",amp:.3},{d:C(29,17,2.9),fill:"#ff6f6f",amp:.3},{d:C(24,28,3),fill:"#ff6f6f",amp:.3},{d:C(26,21,1.1),fill:"#4fd1a5",amp:.1},{d:C(21,25,1),fill:"#4fd1a5",amp:.1}],
  "ים":[{d:C(36,12,6),fill:"#ffd54f",amp:.4},{d:"M3 25C8 19 13 19 18 25C23 31 28 31 33 25C37 20 41 20 45 23L45 44L3 44Z",fill:"#9fd8ff"},
        {d:"M3 32C8 26 13 26 18 32C23 38 28 38 33 32C37 27 41 27 45 30L45 44L3 44Z",fill:"#5cc0f5",dots:[[10,34,1.2],[27,40,1.2]]}],
};

  /* ---------- כותרות השורות והלב: קווים נקיים, בלי רעד ---------- */
const HEART="M24 40C12 32 6.5 25 7.5 18C8.5 11 17 9.5 24 16.5C31 9.5 39.5 11 40.5 18C41.5 25 36 32 24 40Z";
const ICONS={
  recent:[ /* ספר פתוח: כריכה לילך, דפים קרם, שורות בגוון לילך, סימנייה ורודה */
    {d:"M3 15L3 40C11 38 18 38 24 41C30 38 37 38 45 40L45 15C37 13 30 13 24 16C18 13 11 13 3 15Z",fill:"#b9a3f3",dots:[[7,36,1],[41,36,1]]},
    {d:"M24 15C18 11 11 11 6.5 12.5L6.5 36C11 34.5 18 34.5 24 38Z",fill:"#fff4d6"},
    {d:"M24 15C30 11 37 11 41.5 12.5L41.5 36C37 34.5 30 34.5 24 38Z",fill:"#fffaeb"},
    {d:"M11 20L19 20",open:true,color:"#d6c9f7",sw:2.4},{d:"M11 25L18 25",open:true,color:"#d6c9f7",sw:2.4},{d:"M11 30L17 30",open:true,color:"#d6c9f7",sw:2.4},
    {d:"M29 24L37 24",open:true,color:"#d6c9f7",sw:2.4},{d:"M29 29L36 29",open:true,color:"#d6c9f7",sw:2.4},
    {d:"M30 11L30 21.5L32.7 18.8L35.4 21.5L35.4 10.5Z",fill:"#ff8fb1"}],
  favs:[{d:HEART,fill:"#ff8fb1",dots:[[15.5,17,2.2],[19.6,14.4,1]]}],
  ideas:[ /* נורה צהובה, בסיס לילך, קרניים בצהוב כהה */
    {d:"M24 6C15.5 6 11 12.5 12 19.5C12.8 24.5 16.5 27.5 18 32L30 32C31.5 27.5 35.2 24.5 36 19.5C37 12.5 32.5 6 24 6Z",fill:"#ffd54f",dots:[[18,14.5,2.2],[16.6,19.5,1]]},
    {d:"M18.5 33.5L29.5 33.5L29.5 37.5C29.5 39.5 27.5 41 24 41C20.5 41 18.5 39.5 18.5 37.5Z",fill:"#b9a3f3"},
    {d:"M24 0.5L24 2.5",open:true,color:"#ffbf2e"},{d:"M39.5 4.5L37.9 6.2",open:true,color:"#ffbf2e"},{d:"M8.5 4.5L10.1 6.2",open:true,color:"#ffbf2e"},{d:"M45.5 18.5L43 18.5",open:true,color:"#ffbf2e"},{d:"M2.5 18.5L5 18.5",open:true,color:"#ffbf2e"}],
};
/* האייקונים הקטנים (כותרות ולב) בקווים נקיים, כי רעד בקצוות לא נראה טוב בגודל כזה */
const iconSvg={recent:drawIcon(ICONS.recent,11,{frames:1,amp:0}),favs:drawIcon(ICONS.favs,23,{frames:1,amp:0}),ideas:drawIcon(ICONS.ideas,37,{frames:1,amp:0})};
/* הלב של הכפתור: ריק בלילך בהיר, מלא בוורוד. פריים אחד, בלי רעד */
const inner=svg=>svg.replace(/^<svg[^>]*>|<\/svg>$/g,"");
const favSvg=`<svg viewBox="0 0 48 48" aria-hidden="true"><g>${inner(drawIcon([{d:HEART,fill:"#e4dcf5"}],301,{frames:1,amp:0}))}</g><g class="full">${inner(drawIcon([{d:HEART,fill:"#ff6f9a",dots:[[15.5,17,2.4],[19.6,14.3,1.1]]}],301,{frames:1,amp:0}))}</g></svg>`;

  /* ---------- דוגמאות רקע לכריכות: לבן שקוף על הצבע, בקנה מידה גדול ---------- */
const W="rgba(255,255,255,.34)";
function tile(kind){
  const T=(w,h,body,sw=2.2)=>({w,h,svg:`<svg xmlns="${NS}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g fill="none" stroke="${W}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`});
  const fillW=`fill="${W}" stroke="none"`;
  switch(kind){
    case "dots": return T(40,40,`<circle cx="10" cy="10" r="4.2" ${fillW}/><circle cx="30.5" cy="29.5" r="4.6" ${fillW}/>`);
    case "stripes": return T(32,32,`<path d="M0 32C10 23 20 11 32 0M-8 8C-4 4 4 -4 8 -8M24 40C28 36 36 28 40 24"/>`,4.2);
    case "waves": return T(48,24,`<path d="M0 12C6 5 12 5 18 12S30 19 36 12S44 6 48 10"/>`,2.8);
    case "zigzag": return T(40,24,`<path d="M0 16L7 7L14 16L21 7.5L27 16L34 7L40 15"/>`,2.6);
    case "stars": return T(46,46,`<path ${fillW} d="M12 4L14.3 9.6L20 10L15.6 13.7L17 19.5L12 16.3L7 19.5L8.4 13.7L4 10L9.7 9.6Z"/><path ${fillW} d="M34 26L35.7 30.1L40 30.4L36.7 33.2L37.7 37.5L34 35.2L30.3 37.5L31.3 33.2L28 30.4L32.3 30.1Z"/><circle cx="34" cy="9" r="1.6" ${fillW}/><circle cx="11" cy="34" r="1.4" ${fillW}/>`);
    case "hearts": return T(40,40,`<path ${fillW} d="M11 18C5 14 3.5 10.5 4.5 8C5.6 5.4 9 5 11 8C13 5 16.4 5.4 17.5 8C18.5 10.5 17 14 11 18Z"/><path ${fillW} d="M30 36C25 32.6 23.8 29.6 24.6 27.6C25.5 25.4 28.4 25.1 30 27.6C31.6 25.1 34.5 25.4 35.4 27.6C36.2 29.6 35 32.6 30 36Z"/>`);
    case "checks": return T(36,36,`<rect x="2" y="2" width="14" height="14" rx="4" ${fillW}/><rect x="20" y="20" width="14" height="14" rx="4" ${fillW}/>`);
    case "curls": return T(36,22,`<path d="M0 18C0 9 9 9 9 14C9 9 18 9 18 18M18 18C18 9 27 9 27 14C27 9 36 9 36 18" />`,2.4);
    case "confetti": return T(48,48,`<path d="M6 8L11 11M30 5L27 10M40 18L45 16M18 22L16 27M8 38L13 36M30 32L34 36M42 42L40 46M22 44L26 41"/>`,2.8);
    case "plus": return T(36,36,`<path d="M9 5V13M5 9H13M27 22V30M23 26H31"/>`,2.6);
    case "drops": return T(36,40,`<path ${fillW} d="M9 4C9 4 4 11 4 14C4 17 6.3 19 9 19C11.7 19 14 17 14 14C14 11 9 4 9 4Z"/><path ${fillW} d="M27 22C27 22 22 29 22 32C22 35 24.3 37 27 37C29.7 37 32 35 32 32C32 29 27 22 27 22Z"/>`);
    case "rings": return T(40,40,`<circle cx="10" cy="11" r="5.5"/><circle cx="30" cy="30" r="6.5"/>`,2.4);
  }
}
const PATS=[["dots","נקודות"],["stripes","פסים"],["waves","גלים"],["zigzag","זיגזג"],["stars","כוכבים"],["hearts","לבבות"],["checks","משבצות"],["curls","תלתלים"],["confetti","קונפטי"],["plus","פלוסים"],["drops","טיפות"],["rings","טבעות"]];
const patUrl=Object.fromEntries(PATS.map(([k])=>{const t=tile(k); return [k,{url:`url('data:image/svg+xml,${encodeURIComponent(t.svg)}')`,size:t.w*1.9}];}));

  /* ---------- אייקון לכל סיפור ----------
     קודם לפי האימוג'י שמודל השפה כבר בוחר לכל סיפור, אחר כך לפי מילים בשם, ואם אין התאמה, כוכב */
  const STORY_NAMES = ["ינשוף", "דינוזאור בטוטו", "ירח", "אוטובוס", "גלידה", "ארנב", "דג", "כתר", "צב", "שן"];
  const FALLBACK = [star(24, 24, 18, "#ffe066"), { d: C(17.5, 18.5, 2.4), fill: "#ffffff", amp: 0.1 }, star(40, 9, 4, "#ffffff"), star(9, 40, 3, "#ffffff")];
  const BY_EMOJI = {
    "🦉": "ינשוף", "🦕": "דינוזאור", "🦖": "דינוזאור", "🌙": "ירח", "🌛": "ירח", "⭐": "ירח", "🚌": "אוטובוס", "🚍": "אוטובוס",
    "🍦": "גלידה", "🍨": "גלידה", "🐰": "ארנב", "🐇": "ארנב", "🐟": "דג", "🐠": "דג", "👑": "כתר", "🐢": "צב", "🦷": "שן",
    "🐉": "דרקון", "🐲": "דרקון", "🦄": "חד קרן", "🚀": "חללית", "👩‍🚀": "חללית", "🧑‍🚀": "חללית", "🐱": "חתול", "🐈": "חתול",
    "🧜‍♀️": "בת ים", "🧜": "בת ים", "🏴‍☠️": "פיראטים", "⛵": "פיראטים", "🌈": "קשת", "🎂": "יום הולדת", "🎁": "יום הולדת", "🧁": "יום הולדת",
    "🚒": "כבאית", "🐶": "כלב", "🐕": "כלב", "🧚": "פיה", "🧚‍♀️": "פיה", "🪄": "פיה", "🤖": "רובוט", "🍕": "פיצה", "🌊": "ים", "🫧": "ים",
  };
  const WORDS = [
    ["חד קרן", "חד קרן"], ["בת ים", "בת ים"], ["יום הולדת", "יום הולדת"], ["שודד ים", "פיראטים"], ["שודדי ים", "פיראטים"],
    ["גלידה", "גלידה"], ["דינוזאור", "דינוזאור"], ["חללית", "חללית"], ["חלל", "חללית"], ["אסטרונאוט", "חללית"], ["טיל", "חללית"],
    ["חתול", "חתול"], ["חתולה", "חתול"], ["דרקון", "דרקון"], ["פיראט", "פיראטים"], ["קשת", "קשת"], ["עוגה", "יום הולדת"],
    ["כבאית", "כבאית"], ["כבאי", "כבאית"], ["כלב", "כלב"], ["כלבלב", "כלב"], ["פיה", "פיה"], ["רובוט", "רובוט"], ["פיצה", "פיצה"],
    ["ים", "ים"], ["ינשוף", "ינשוף"], ["ירח", "ירח"], ["אוטובוס", "אוטובוס"], ["דג", "דג"], ["דגים", "דג"], ["דגי", "דג"],
    ["כתר", "כתר"], ["מלכה", "כתר"], ["מלך", "כתר"], ["נסיכה", "כתר"], ["צב", "צב"], ["שן", "שן"], ["שיניים", "שן"], ["חיידק", "שן"],
    ["ארנב", "ארנב"], ["ארנבון", "ארנב"],
  ];
  const plain = (t) => String(t || "").normalize("NFD").replace(/[֑-ׇ]/g, "").replace(/[^א-ת ]+/g, " ").replace(/\s+/g, " ").trim();
  function iconName(title, emoji) {
    if (emoji && BY_EMOJI[emoji]) return BY_EMOJI[emoji];
    const words = plain(title).split(" ");
    /* כל מילה גם בלי אות שימוש אחת בהתחלה: והחושך, בים, לירח */
    const forms = new Set(words.flatMap((w) => [w, /^[והבלמשכ]/.test(w) && w.length > 2 ? w.slice(1) : w]));
    const text = ` ${plain(title)} `;
    for (const [word, name] of WORDS) {
      if (word.includes(" ") ? text.includes(` ${word} `) : forms.has(word)) return name;
    }
    return null;
  }
  const iconFor = (name) => {
    const key = "n:" + name;
    if (!cache[key]) {
      const si = STORY_NAMES.indexOf(name);
      if (si >= 0) cache[key] = drawIcon(STORY_ICONS[si].filter((x) => x.fill !== "none"), 900 + si * 71, { frames: 1, amp: 0.8 });
      else if (IDEA_ICONS[name]) cache[key] = ideaSvg(name);
      else cache[key] = drawIcon(FALLBACK, 1999, { frames: 1, amp: 0.6 });
    }
    return cache[key];
  };
  const patternFor = (key) => {
    let h = 0;
    for (const ch of String(key)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return patUrl[PATS[h % PATS.length][0]];
  };

  const cache = {};
  const ideaSvg = (name) => {
    if (!cache[name]) {
      const i = Object.keys(IDEA_ICONS).indexOf(name);
      cache[name] = drawIcon(IDEA_ICONS[name], 1500 + i * 53, { frames: 1, amp: 0.8 });
    }
    return cache[name];
  };
  window.Icons = {
    ideas: IDEAS.map(([, name, color]) => ({ name, color })),
    idea: ideaSvg,
    /* כריכה של סיפור: אייקון (לפי אימוג'י או שם) ודוגמת רקע קבועה לפי המזהה */
    cover: (story) => ({ svg: iconFor(iconName(story.title, story.emoji) || "*"), pattern: patternFor(story.id || story.title) }),
    ui: iconSvg,
    heart: favSvg,
  };
})();
