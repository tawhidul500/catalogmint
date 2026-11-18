import { productImage, siteHost } from "./types";
import type { Format, Product } from "./types";
type Photo={data:string; bytes:Uint8Array; w:number; h:number};
type Progress=(n:number,total:number)=>void;
const headers=["Code type","Barcode / code","Product name (Bangla)","Product name (English)","Weight / size & unit","Category","Product URL","Original image URL","Original name (other language)"];
const row=(p:Product)=>[p.codeType,p.code,p.nameBn,p.nameEn,p.size,p.category,p.sourceUrl,p.imageUrl,p.originalName||""];
function save(file:Blob,filename:string) {
  const url=URL.createObjectURL(file),a=document.createElement("a");
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function spreadsheetText(value:string) {
  return /^[\s]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? "'"+value : value;
}
function csvCell(value:string) {return '"'+spreadsheetText(value).replace(/"/g,'""')+'"';}
async function loadImage(src:string) {
  const img=new Image();img.decoding="async";
  await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error("Image unavailable"));img.src=src;});
  return img;
}
async function photo(p:Product):Promise<Photo|null> {
  const source=productImage(p);if (!source) return null;
  let object="";
  try {
    const response=await fetch(source,{signal:AbortSignal.timeout(15000)});
    if (!response.ok) return null;
    object=URL.createObjectURL(await response.blob());
    const img=await loadImage(object);
    const ratio=Math.min(1,900/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
    const ctx=canvas.getContext("2d");if (!ctx) return null;
    ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const data=canvas.toDataURL("image/jpeg",.88), bytes=Uint8Array.from(atob(data.slice(data.indexOf(",")+1)),c=>c.charCodeAt(0));
    return {data,bytes,w:canvas.width,h:canvas.height};
  } catch {return null;} finally {if(object) URL.revokeObjectURL(object);}
}
async function photos(products:Product[],progress:Progress) {
  const out:(Photo|null)[]=new Array(products.length),cache=new Map<string,Promise<Photo|null>>();
  let next=0,done=0;
  async function run() {
    while (next<products.length) {
      const i=next++,key=productImage(products[i]);
      if (!cache.has(key)) cache.set(key,photo(products[i]));
      out[i]=await cache.get(key)!;
      progress(++done,products.length);
    }
  }
  await Promise.all(Array.from({length:Math.min(4,products.length)},run));
  return out;
}
const fit=(im:Photo,w:number,h:number)=>{const k=Math.min(w/im.w,h/im.h);return {width:im.w*k,height:im.h*k};};
async function excel(products:Product[],images:(Photo|null)[]) {
  const {default:Excel}=await import("exceljs");
  const wb=new Excel.Workbook();wb.creator="CatalogMint";
  const sheet=wb.addWorksheet("Products",{views:[{state:"frozen",xSplit:1,ySplit:1}],properties:{defaultRowHeight:22}});
  sheet.columns=["Photo",...headers].map((header,i)=>({header,width:[17,16,24,44,44,22,24,48,54,38][i]}));
  const head=sheet.getRow(1);head.height=31;
  head.eachCell(c=>{c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF154B3B"}};c.font={name:"Calibri",color:{argb:"FFFFFFFF"},bold:true,size:11};c.alignment={vertical:"middle",indent:1};});
  products.forEach((p,i)=>{
    const r=sheet.addRow(["",...row(p)]);r.height=70;
    r.eachCell({includeEmpty:true},(cell,col)=>{cell.font={name:col===4 ? "Noto Sans Bengali":"Calibri",size:11,color:{argb:"FF233A31"}};
      cell.alignment={vertical:"middle",wrapText:true,indent:1}; if(i%2)cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFF1F6F1"}};
    });
    r.getCell(3).numFmt="@";
    for(const col of [8,9]) {const url=String(r.getCell(col).value||"");if(url)r.getCell(col).value={text:url,hyperlink:url};}
    const image=images[i];
    if(image){const id=wb.addImage({base64:image.data,extension:"jpeg"}); const box=fit(image,92,78);sheet.addImage(id,{tl:{col:.12,row:i+1+.07},ext:box,editAs:"oneCell"});}
  });
  sheet.autoFilter={from:"A1",to:"J1"};
  return new Blob([await wb.xlsx.writeBuffer() as ArrayBuffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}
async function word(products:Product[],images:(Photo|null)[],store:string) {
  const {Document,Packer,Paragraph,TextRun,ImageRun,ExternalHyperlink,Table,TableRow,TableCell,WidthType,BorderStyle,HeadingLevel,VerticalAlign}=await import("docx");
  const para=(value:string,opts:{bold?:boolean;size?:number;color?:string;font?:string}={})=>new Paragraph({spacing:{after:65},children:[new TextRun({text:value,font:opts.font||"Calibri",...opts})]});
  const link=(label:string,url:string)=>new ExternalHyperlink({link:url,children:[new TextRun({text:label,style:"Hyperlink"})]});
  const rows=products.map((p,i)=>{
    const im=images[i],imgP=im ? new Paragraph({children:[new ImageRun({type:"jpg",data:im.bytes,transformation:fit(im,100,94),altText:{title:p.nameEn||p.nameBn,description:"Original store product photo",name:"Product photo"}})]}) : para("Image unavailable",{size:17});
    const info=[para(p.nameEn||p.originalName||"English name unavailable",{bold:true,size:25,color:"174E3E"}),para(p.nameBn||"Bangla name unavailable",{font:p.nameBn?"Noto Sans Bengali":"Calibri",size:22}),
      para((p.codeType||"Code")+"  "+(p.code||"—")+"     |     Weight / size  "+(p.size||"—"))];
    if(p.category) info.push(para(p.category,{size:19,color:"62736C"}));
    const links=[];if(p.sourceUrl)links.push(link("Product page",p.sourceUrl));if(p.imageUrl){if(links.length)links.push(new TextRun("     ·     "));links.push(link("Original image",p.imageUrl));}
    if(links.length)info.push(new Paragraph({children:links}));
    return new TableRow({cantSplit:true,children:[new TableCell({width:{size:23,type:WidthType.PERCENTAGE},verticalAlign:VerticalAlign.CENTER,children:[imgP]}),new TableCell({width:{size:77,type:WidthType.PERCENTAGE},children:info})]});
  });
  const line={style:BorderStyle.SINGLE,color:"DCE7E0",size:4},none={style:BorderStyle.NONE,size:0,color:"FFFFFF"};
  const table=new Table({width:{size:100,type:WidthType.PERCENTAGE},rows,margins:{top:145,bottom:145,left:130,right:130},borders:{top:line,bottom:line,insideHorizontal:line,left:none,right:none,insideVertical:none}});
  const doc=new Document({creator:"CatalogMint",title:"Product catalog",sections:[{properties:{page:{margin:{top:800,bottom:800,left:850,right:850}}},children:[new Paragraph({text:"Product catalog",heading:HeadingLevel.TITLE}),para(store+"  ·  "+products.length+" products",{size:22,color:"456858"}),table]}]});
  return Packer.toBlob(doc);
}
async function rasterLine(value:string,maxPx:number,size:number,color:string) {
  const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d")!;
  await document.fonts.load(size+'px "Mint Bengali"',value);
  const font=size+'px "Mint Bengali", "DM Sans", sans-serif';ctx.font=font;
  const words=value.split(/\s+/);const lines:string[]=[];let line="";
  for(const word of words){const next=(line?line+" ":"")+word;if(line && ctx.measureText(next).width>maxPx){lines.push(line);line=word;}else line=next;}
  if(line)lines.push(line);
  const lineHeight=Math.ceil(size*1.52);canvas.width=maxPx;canvas.height=Math.max(lineHeight,lines.length*lineHeight+6);
  ctx.font=font;ctx.fillStyle=color;ctx.textBaseline="top";lines.forEach((l,i)=>ctx.fillText(l,0,i*lineHeight,maxPx));
  return {data:canvas.toDataURL("image/png"),height:canvas.height};
}
async function pdf(products:Product[],images:(Photo|null)[],store:string) {
  const {jsPDF}=await import("jspdf");const doc=new jsPDF({unit:"mm",format:"a4",compress:true});
  doc.setProperties({title:"Product catalog · "+siteHost(store),author:"CatalogMint"});
  function heading(){
    doc.setFillColor(21,75,59);doc.rect(0,0,210,34,"F");
    doc.setFont("helvetica","bold");doc.setFontSize(20);doc.setTextColor(255);doc.text("Product catalog",16,16);
    doc.setFont("helvetica","normal");doc.setFontSize(10);doc.text(siteHost(store)+"  |  "+products.length+" products",16,25);
  }
  heading();let y=43;
  for(let i=0;i<products.length;i++){
    const p=products[i],im=images[i];const en=p.nameEn||p.originalName||"English name unavailable",bn=p.nameBn;
    const titleLines=doc.splitTextToSize(en,130) as string[];
    const textImg=bn ? await rasterLine(bn,940,32,"#475e52") : null;
    const useImageTitle=/[^\u0000-\u00ff\u2000-\u206f]/.test(en);
    const titleImg=useImageTitle ? await rasterLine(en,940,35,"#173d30") : null;
    const titleHeight=titleImg ? titleImg.height*132/940 : Math.min(titleLines.length,10)*5.1;
    const bnH=textImg ? textImg.height*132/940 : 0;
    const info=(p.codeType||"Code")+"  "+(p.code||"—")+"    |    Weight / size  "+(p.size||"—");
    const infoImg=/[^\u0000-\u00ff\u2000-\u206f]/.test(info) ? await rasterLine(info,940,27,"#34473c") : null;
    const infoH=infoImg ? infoImg.height*132/940 : 6;
    const height=Math.max(43,titleHeight+bnH+infoH+20);
    if(y+height>279 && y>43){doc.addPage();heading();y=43;}
    if(im){const box=fit(im,33,33);doc.addImage(im.data,"JPEG",17+(33-box.width)/2,y+(36-box.height)/2,box.width,box.height);}
    else {doc.setFontSize(7);doc.setTextColor(125);doc.text("Image unavailable",18,y+16);}
    let ty=y+2;
    doc.setTextColor(23,61,48);doc.setFont("helvetica","bold");doc.setFontSize(12);
    if(titleImg)doc.addImage(titleImg.data,"PNG",58,ty,132,titleHeight);else doc.text(titleLines.slice(0,10),58,ty+4);
    ty+=titleHeight+2;
    if(textImg){doc.addImage(textImg.data,"PNG",58,ty,132,bnH);ty+=bnH+1;}
    doc.setFont("helvetica","normal");doc.setFontSize(9);doc.setTextColor(52,71,60);
    if(infoImg)doc.addImage(infoImg.data,"PNG",58,ty,132,infoH);else doc.text(info,58,ty+4,{maxWidth:135});
    ty+=infoH+3;doc.setTextColor(24,106,75);
    if(p.sourceUrl)doc.textWithLink("Product page",58,ty+3,{url:p.sourceUrl});
    if(p.imageUrl)doc.textWithLink("Original image",87,ty+3,{url:p.imageUrl});
    y+=height;doc.setDrawColor(220,230,223);doc.line(16,y-2,194,y-2);y+=4;
  }
  for(let pg=1;pg<=doc.getNumberOfPages();pg++){doc.setPage(pg);doc.setFontSize(8);doc.setTextColor(90);doc.text("CatalogMint",16,288);doc.text(pg+" / "+doc.getNumberOfPages(),194,288,{align:"right"});}
  return doc.output("blob");
}
export async function exportProducts(format:Format,products:Product[],store:string,progress:Progress=()=>{}) {
  if(!products.length) throw Error("Select at least one product to export.");
  const filename=(siteHost(store).replace(/[^A-Za-z0-9.-]/g,"-") || "store")+"-catalog-"+new Date().toISOString().slice(0,10)+"."+format;
  let blob:Blob;let missing=0;
  if(format==="csv") {
    const lines=[headers,...products.map(row)].map(r=>r.map(csvCell).join(","));
    blob=new Blob(["\uFEFF"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"});
  } else if(format==="txt") {
    const blocks=products.map((p,i)=>"["+String(i+1)+"]\r\n"+row(p).map((v,n)=>headers[n]+": "+(v||"—")).join("\r\n"));
    blob=new Blob(["\uFEFFProduct catalog | "+store+"\r\n\r\n"+blocks.join("\r\n\r\n")],{type:"text/plain;charset=utf-8"});
  } else {
    const imgs=await photos(products,progress);missing=imgs.filter(i=>!i).length;
    if(format==="pdf")blob=await pdf(products,imgs,store);else if(format==="xlsx")blob=await excel(products,imgs);else blob=await word(products,imgs,store);
  }
  save(blob,filename);return {missing,filename};
}
