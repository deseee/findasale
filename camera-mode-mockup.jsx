import { useState } from "react";

// ─── seed data ────────────────────────────────────────────────────────────────
const EMOJIS = ["🪑","🏺","📦","🖼️","💡","🎨","🪞","🕰️","📚","🧸","🧲","🪴"];
let idCounter = 10;

const SEED_ITEMS = [
  { id:1,  status:"complete", thumb:"🪑", label:"Oak Dining Chair",    confidence:94, photoCount:1, price:"45",  category:"Furniture",    enhanced:true,  bgRemoved:false, aspect:"4:3" },
  { id:2,  status:"complete", thumb:"🏺", label:"Blue Ceramic Vase",   confidence:61, photoCount:1, price:"28",  category:"Décor",        enhanced:true,  bgRemoved:false, aspect:"4:3" },
  { id:3,  status:"complete", thumb:"📦", label:"Item 3",              confidence:38, photoCount:2, price:"",    category:"",             enhanced:false, bgRemoved:false, aspect:"4:3" },
  { id:4,  status:"complete", thumb:"🕰️", label:"Mantle Clock",        confidence:88, photoCount:1, price:"120", category:"Collectibles", enhanced:true,  bgRemoved:false, aspect:"4:3" },
  { id:5,  status:"analyzing",thumb:"🎨", label:"Analyzing…",          confidence:null,photoCount:1, price:"",   category:"",             enhanced:false, bgRemoved:false, aspect:"4:3" },
];

function addItem(setCaptured, overrides={}) {
  const id = ++idCounter;
  const thumb = EMOJIS[Math.floor(Math.random()*EMOJIS.length)];
  const item = { id, status:"uploading", thumb, label:"Uploading…", confidence:null, photoCount:1, price:"", category:"", enhanced:false, bgRemoved:false, aspect:"4:3", ...overrides };
  setCaptured(p => [item, ...p]);
  setTimeout(() => setCaptured(p => p.map(i => i.id===id ? {...i, status:"analyzing", label:"Analyzing…"} : i)), 900);
  setTimeout(() => setCaptured(p => p.map(i => i.id===id ? {...i, status:"complete", label:"New Item", confidence:Math.floor(Math.random()*20)+75, enhanced:true} : i)), 3000);
}

// ─── confidence helpers ───────────────────────────────────────────────────────
const confColor  = (c) => c==null ? "#6b7280" : c>=80 ? "#22c55e" : c>=55 ? "#f59e0b" : "#ef4444";
const confLabel  = (c) => c==null ? "…" : c>=80 ? "Good" : c>=55 ? "Review" : "Low";
const STATUS_CLR = { complete:"#22c55e", analyzing:"#f59e0b", uploading:"#60a5fa", error:"#ef4444" };
const STATUS_ICO = { complete:"✓", analyzing:"◐", uploading:"↑", error:"⚠" };

// ─── main component ───────────────────────────────────────────────────────────
export default function CameraMockup() {
  const [screen,    setScreen]    = useState("camera"); // "camera" | "publish"
  const [mode,      setMode]      = useState("rapidfire");
  const [captured,  setCaptured]  = useState(SEED_ITEMS);
  const [flash,     setFlash]     = useState(false);
  const [torchOn,   setTorchOn]   = useState(false);
  const [addingTo,  setAddingTo]  = useState(null);
  // regular mode
  const [photosThisItem, setPhotosThisItem] = useState(0);
  const MAX_REG = 5;
  // publish screen
  const [editingId,    setEditingId]    = useState(null);
  const [selectedIds,  setSelectedIds]  = useState(new Set());
  const [buyerPreview, setBuyerPreview] = useState(false);
  const [bulkPanel,    setBulkPanel]    = useState(false); // "price" | "category" | false

  const isRapidfire = mode === "rapidfire";
  const inAddMode   = addingTo !== null;
  const addingItem  = inAddMode ? captured.find(i => i.id===addingTo) : null;
  const editingItem = editingId  ? captured.find(i => i.id===editingId)  : null;
  const readyCount  = captured.filter(i => i.status==="complete").length;

  // ─── camera actions ─────────────────────────────────────────────────────────
  const handleCapture = () => {
    setFlash(true); setTimeout(() => setFlash(false), 110);
    if (isRapidfire) {
      if (inAddMode) {
        setCaptured(p => p.map(i => i.id===addingTo ? {...i, photoCount:i.photoCount+1} : i));
        setAddingTo(null);
      } else { addItem(setCaptured); }
    } else {
      const n = photosThisItem+1; setPhotosThisItem(n);
    }
  };
  const handleDoneWithItem = () => {
    addItem(setCaptured, { photoCount:photosThisItem }); setPhotosThisItem(0);
  };

  // ─── publish actions ─────────────────────────────────────────────────────────
  const updateItem = (id, patch) => setCaptured(p => p.map(i => i.id===id ? {...i,...patch} : i));
  const toggleSelect = (id) => setSelectedIds(prev => { const s=new Set(prev); s.has(id)?s.delete(id):s.add(id); return s; });
  const selectAll = () => setSelectedIds(new Set(captured.map(i=>i.id)));
  const clearSelect = () => setSelectedIds(new Set());

  // ─── styles ──────────────────────────────────────────────────────────────────
  const f = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const base = { fontFamily:f, position:"relative", width:"100%", height:"100vh", minHeight:600, overflow:"hidden" };

  // ═══════════════════════════════════════════════════════════════════════════
  // CAMERA SCREEN
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === "camera") return (
    <div style={{...base, background:"#0a0a0a", display:"flex", alignItems:"center", justifyContent:"center", userSelect:"none"}}>

      {/* Viewfinder */}
      <div style={{ position:"absolute", inset:0, background:"linear-gradient(160deg,#1a1a1c,#2a2a2e,#1a1a1c)", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ fontSize:130, opacity:0.22 }}>🪑</div>
        {/* Focus box */}
        <div style={{ position:"absolute", width:150, height:150, border:"2px solid rgba(255,255,255,0.45)", borderRadius:14 }} />
        {/* 4:3 aspect ratio crop guide — corner brackets */}
        {["tl","tr","bl","br"].map(pos => (
          <div key={pos} style={{
            position:"absolute",
            top:    pos.startsWith("t") ? "12%" : undefined,
            bottom: pos.startsWith("b") ? "12%" : undefined,
            left:   pos.endsWith("l")   ? "8%"  : undefined,
            right:  pos.endsWith("r")   ? "8%"  : undefined,
            width:22, height:22,
            borderTop:    pos.startsWith("t") ? "2px solid rgba(255,255,255,0.5)" : undefined,
            borderBottom: pos.startsWith("b") ? "2px solid rgba(255,255,255,0.5)" : undefined,
            borderLeft:   pos.endsWith("l")   ? "2px solid rgba(255,255,255,0.5)" : undefined,
            borderRight:  pos.endsWith("r")   ? "2px solid rgba(255,255,255,0.5)" : undefined,
          }} />
        ))}
        {/* aspect label */}
        <div style={{ position:"absolute", top:"9%", left:"50%", transform:"translateX(-50%)", color:"rgba(255,255,255,0.35)", fontSize:10 }}>4:3</div>
        {flash && <div style={{ position:"absolute", inset:0, background:"rgba(255,255,255,0.65)", zIndex:100 }} />}
      </div>

      {/* TOP BAR */}
      <div style={{ position:"absolute", top:0, left:0, right:0, zIndex:20, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 20px 14px", background:"linear-gradient(to bottom, rgba(0,0,0,0.65),transparent)" }}>
        <button onClick={() => setTorchOn(t=>!t)} style={{ width:40, height:40, borderRadius:"50%", border:"none", cursor:"pointer", background: torchOn?"rgba(255,200,0,0.25)":"rgba(255,255,255,0.1)", color: torchOn?"#fcd34d":"rgba(255,255,255,0.75)", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>
          {torchOn?"🔦":"💡"}
        </button>
        {/* MODE TOGGLE */}
        <div style={{ display:"flex", alignItems:"center", background:"rgba(0,0,0,0.7)", borderRadius:32, padding:3, gap:2, border:"1px solid rgba(255,255,255,0.15)" }}>
          {[["rapidfire","⚡ Rapidfire",true],["regular","📷 Regular",false]].map(([m,label,isRF])=>(
            <button key={m} onClick={()=>{setMode(m);setAddingTo(null);setPhotosThisItem(0);}} style={{ padding:"8px 18px", borderRadius:26, fontSize:13, fontWeight:700, cursor:"pointer", border:"none", transition:"all 0.2s", background: mode===m?(isRF?"#f59e0b":"#fff"):"transparent", color: mode===m?(isRF?"#fff":"#000"):"rgba(255,255,255,0.5)" }}>
              {label}
            </button>
          ))}
        </div>
        {/* Publish button */}
        <button onClick={()=>setScreen("publish")} style={{ background:"#f59e0b", color:"#000", border:"none", borderRadius:20, padding:"6px 14px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
          Review {readyCount > 0 && `(${readyCount})`}
        </button>
      </div>

      {/* MODE HINT */}
      <div style={{ position:"absolute", top:76, left:0, right:0, zIndex:20, display:"flex", justifyContent:"center" }}>
        <span style={{ color:"rgba(255,255,255,0.5)", fontSize:12, background:"rgba(0,0,0,0.3)", borderRadius:20, padding:"4px 14px" }}>
          {isRapidfire
            ? (inAddMode ? `Adding photo → ${addingItem?.thumb} ${addingItem?.label}` : "1 photo = 1 item · tap + on any thumbnail to add more")
            : `Up to ${MAX_REG} photos per item`}
        </span>
      </div>

      {/* REGULAR: dots */}
      {!isRapidfire && (
        <div style={{ position:"absolute", top:108, left:0, right:0, zIndex:20, display:"flex", justifyContent:"center", alignItems:"center", gap:8 }}>
          {Array.from({length:MAX_REG}).map((_,i)=>(
            <div key={i} style={{ width:i<photosThisItem?10:8, height:i<photosThisItem?10:8, borderRadius:"50%", background:i<photosThisItem?"white":"rgba(255,255,255,0.3)", transition:"all 0.2s" }} />
          ))}
          <span style={{ color:"rgba(255,255,255,0.5)", fontSize:12, marginLeft:6 }}>{photosThisItem}/{MAX_REG}</span>
        </div>
      )}

      {/* RAPIDFIRE: carousel */}
      {isRapidfire && (
        <div style={{ position:"absolute", bottom:108, left:0, right:0, zIndex:20, padding:"0 16px" }}>
          <div style={{ display:"flex", gap:10, overflowX:"auto", paddingBottom:4, scrollbarWidth:"none" }}>
            {captured.map(item => {
              const isOpen = addingTo===item.id;
              return (
                <div key={item.id} style={{ flexShrink:0, position:"relative", width:64, height:64, borderRadius:14, cursor:"pointer", background:isOpen?"rgba(245,158,11,0.15)":"rgba(255,255,255,0.08)", border:isOpen?"2px solid #f59e0b":"1.5px solid rgba(255,255,255,0.18)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, boxShadow:isOpen?"0 0 12px rgba(245,158,11,0.35)":"none", transition:"all 0.18s" }}>
                  {item.thumb}
                  {/* status badge */}
                  <div style={{ position:"absolute", top:-5, right:-5, width:20, height:20, borderRadius:"50%", background:STATUS_CLR[item.status]||"#9ca3af", color:"white", fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", border:"2px solid #0a0a0a" }}>
                    {STATUS_ICO[item.status]||"?"}
                  </div>
                  {/* enhanced badge */}
                  {item.enhanced && item.status==="complete" && (
                    <div style={{ position:"absolute", top:-5, left:-5, width:18, height:18, borderRadius:"50%", background:"#7c3aed", color:"white", fontSize:9, display:"flex", alignItems:"center", justifyContent:"center", border:"2px solid #0a0a0a" }} title="Auto-enhanced">✨</div>
                  )}
                  {/* photo count */}
                  {item.photoCount>1 && (
                    <div style={{ position:"absolute", bottom:-6, left:"50%", transform:"translateX(-50%)", background:"rgba(0,0,0,0.75)", color:"white", fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:4, whiteSpace:"nowrap", border:"1px solid rgba(255,255,255,0.2)" }}>
                      ×{item.photoCount}
                    </div>
                  )}
                  {/* + button */}
                  <button onClick={()=>setAddingTo(p=>p===item.id?null:item.id)} style={{ position:"absolute", bottom:-8, right:-8, width:22, height:22, borderRadius:"50%", border:"2px solid #0a0a0a", background:isOpen?"#f59e0b":"rgba(255,255,255,0.85)", color:isOpen?"white":"#000", fontSize:14, fontWeight:700, lineHeight:1, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", zIndex:5 }}>
                    {isOpen?"×":"+"}
                  </button>
                </div>
              );
            })}
            {/* Review shortcut */}
            {captured.length>0 && (
              <div onClick={()=>setScreen("publish")} style={{ flexShrink:0, width:64, height:64, borderRadius:14, border:"1.5px solid rgba(245,158,11,0.5)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", cursor:"pointer", background:"rgba(245,158,11,0.07)" }}>
                <span style={{ color:"#f59e0b", fontSize:20 }}>→</span>
                <span style={{ color:"#f59e0b", fontSize:10, fontWeight:700 }}>Publish</span>
              </div>
            )}
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", marginTop:8, padding:"0 2px" }}>
            <span style={{ color:"rgba(255,255,255,0.35)", fontSize:11 }}>{captured.length} captured</span>
            <span style={{ color:"rgba(255,255,255,0.35)", fontSize:11 }}>{captured.filter(i=>i.enhanced).length} auto-enhanced ✨</span>
          </div>
        </div>
      )}

      {/* Adding-to banner */}
      {isRapidfire && inAddMode && (
        <div style={{ position:"absolute", bottom:116, left:0, right:0, zIndex:25, display:"flex", justifyContent:"center" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, background:"rgba(245,158,11,0.18)", border:"1.5px solid rgba(245,158,11,0.5)", borderRadius:24, padding:"8px 16px" }}>
            <span style={{ fontSize:16 }}>{addingItem?.thumb}</span>
            <span style={{ color:"#fcd34d", fontSize:13, fontWeight:600 }}>Next shot adds to this item · photo {(addingItem?.photoCount||0)+1}</span>
            <button onClick={()=>setAddingTo(null)} style={{ color:"rgba(255,255,255,0.5)", fontSize:18, background:"none", border:"none", cursor:"pointer", padding:0 }}>×</button>
          </div>
        </div>
      )}

      {/* REGULAR: action buttons */}
      {!isRapidfire && photosThisItem>0 && (
        <div style={{ position:"absolute", bottom:108, left:0, right:0, zIndex:20, display:"flex", gap:10, padding:"0 24px" }}>
          <button onClick={handleDoneWithItem} style={{ flex:1, padding:"13px 0", borderRadius:14, border:"none", background:"rgba(255,255,255,0.95)", color:"#000", fontSize:14, fontWeight:600, cursor:"pointer" }}>✓ Done with item</button>
          {photosThisItem<MAX_REG && <button onClick={handleCapture} style={{ flex:1, padding:"13px 0", borderRadius:14, border:"1.5px solid rgba(255,255,255,0.2)", background:"rgba(255,255,255,0.07)", color:"rgba(255,255,255,0.8)", fontSize:14, fontWeight:600, cursor:"pointer" }}>+ Add photo</button>}
        </div>
      )}

      {/* SHUTTER ROW */}
      <div style={{ position:"absolute", bottom:22, left:0, right:0, zIndex:20, display:"flex", alignItems:"center", justifyContent:"center", gap:44 }}>
        {/* Gallery */}
        <div style={{ position:"relative", width:50, height:50, borderRadius:12, background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, cursor:"pointer" }}>
          {captured.length>0?captured[0].thumb:"🖼️"}
          {captured.length>0 && <div style={{ position:"absolute", bottom:-6, left:"50%", transform:"translateX(-50%)", background:"rgba(0,0,0,0.7)", color:"rgba(255,255,255,0.6)", fontSize:9, padding:"1px 5px", borderRadius:4, whiteSpace:"nowrap" }}>{captured.length}</div>}
        </div>
        {/* Shutter */}
        <button onClick={handleCapture} style={{ width:80, height:80, borderRadius:"50%", border:"4px solid rgba(255,255,255,0.88)", background:inAddMode?"linear-gradient(135deg,#d97706,#b45309)":isRapidfire?"linear-gradient(135deg,#f59e0b,#ef4444)":"white", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:30, boxShadow:isRapidfire?"0 0 22px rgba(245,158,11,0.45)":"0 0 14px rgba(255,255,255,0.25)" }}>
          {inAddMode?"+":isRapidfire?"⚡":"📷"}
        </button>
        {/* Flip */}
        <button style={{ width:50, height:50, borderRadius:"50%", background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", color:"rgba(255,255,255,0.8)", fontSize:20, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>🔄</button>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLISH SCREEN
  // ═══════════════════════════════════════════════════════════════════════════
  const ASPECTS = ["4:3","1:1","16:9"];

  return (
    <div style={{...base, background:"#0f0f0f", display:"flex", flexDirection:"column"}}>

      {/* HEADER */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 20px", borderBottom:"1px solid rgba(255,255,255,0.08)", background:"#0f0f0f", flexShrink:0 }}>
        <button onClick={()=>{setScreen("camera");setEditingId(null);}} style={{ color:"rgba(255,255,255,0.5)", fontSize:14, background:"none", border:"none", cursor:"pointer" }}>← Camera</button>
        <div>
          <span style={{ color:"white", fontSize:16, fontWeight:600 }}>Review & Publish</span>
          <span style={{ color:"rgba(255,255,255,0.35)", fontSize:12, marginLeft:8 }}>{readyCount} ready</span>
        </div>
        <button style={{ background:"#f59e0b", color:"#000", border:"none", borderRadius:20, padding:"8px 18px", fontSize:13, fontWeight:700, cursor:"pointer" }}>
          Publish all
        </button>
      </div>

      {/* BATCH TOOLBAR */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 16px", borderBottom:"1px solid rgba(255,255,255,0.06)", background:"#141414", flexShrink:0 }}>
        <button onClick={selectedIds.size===captured.length?clearSelect:selectAll} style={{ fontSize:12, color:"rgba(255,255,255,0.5)", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8, padding:"5px 10px", cursor:"pointer" }}>
          {selectedIds.size===captured.length?"Deselect all":"Select all"}
        </button>
        {selectedIds.size>0 && <>
          <span style={{ color:"rgba(255,255,255,0.3)", fontSize:12 }}>{selectedIds.size} selected</span>
          <button onClick={()=>setBulkPanel("price")} style={{ fontSize:12, color:"#f59e0b", background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.3)", borderRadius:8, padding:"5px 10px", cursor:"pointer" }}>$ Bulk price</button>
          <button onClick={()=>setBulkPanel("category")} style={{ fontSize:12, color:"#60a5fa", background:"rgba(96,165,250,0.1)", border:"1px solid rgba(96,165,250,0.3)", borderRadius:8, padding:"5px 10px", cursor:"pointer" }}>🏷 Bulk category</button>
          <button onClick={()=>{setCaptured(p=>p.map(i=>selectedIds.has(i.id)?{...i,bgRemoved:true}:i));clearSelect();}} style={{ fontSize:12, color:"#a78bfa", background:"rgba(167,139,250,0.1)", border:"1px solid rgba(167,139,250,0.3)", borderRadius:8, padding:"5px 10px", cursor:"pointer" }}>✂ Remove BG</button>
        </>}
        <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
          <button onClick={()=>setBuyerPreview(true)} style={{ fontSize:12, color:"rgba(255,255,255,0.5)", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8, padding:"5px 10px", cursor:"pointer" }}>👁 Buyer preview</button>
        </div>
      </div>

      {/* ITEM LIST */}
      <div style={{ flex:1, overflowY:"auto", padding:"12px 16px", display:"flex", flexDirection:"column", gap:10 }}>
        {captured.map(item => {
          const isEditing = editingId===item.id;
          const isSelected = selectedIds.has(item.id);
          const conf = item.confidence;
          const confBorderColor = conf==null?"rgba(255,255,255,0.08)": conf>=80?"rgba(34,197,94,0.25)": conf>=55?"rgba(245,158,11,0.3)":"rgba(239,68,68,0.35)";

          return (
            <div key={item.id} style={{ borderRadius:14, border:`1.5px solid ${isSelected?"rgba(245,158,11,0.5)":confBorderColor}`, background:isSelected?"rgba(245,158,11,0.04)":"rgba(255,255,255,0.03)", overflow:"hidden", transition:"all 0.18s" }}>

              {/* Item row */}
              <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", cursor:"pointer" }} onClick={()=>setEditingId(isEditing?null:item.id)}>
                {/* Select checkbox */}
                <div onClick={e=>{e.stopPropagation();toggleSelect(item.id);}} style={{ width:20, height:20, borderRadius:6, border:`2px solid ${isSelected?"#f59e0b":"rgba(255,255,255,0.2)"}`, background:isSelected?"#f59e0b":"transparent", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 }}>
                  {isSelected && <span style={{ color:"black", fontSize:12, fontWeight:700 }}>✓</span>}
                </div>
                {/* Thumb */}
                <div style={{ position:"relative", width:52, height:52, borderRadius:10, background: item.bgRemoved?"transparent":"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, flexShrink:0 }}>
                  {item.thumb}
                  {item.bgRemoved && <div style={{ position:"absolute", inset:0, borderRadius:9, border:"1.5px dashed rgba(167,139,250,0.5)", background:"rgba(167,139,250,0.05)" }} />}
                  {item.enhanced && <div style={{ position:"absolute", top:-4, left:-4, width:16, height:16, borderRadius:"50%", background:"#7c3aed", color:"white", fontSize:8, display:"flex", alignItems:"center", justifyContent:"center", border:"1.5px solid #0f0f0f" }}>✨</div>}
                </div>
                {/* Info */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ color:"white", fontSize:14, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.label}</div>
                  <div style={{ display:"flex", gap:8, marginTop:3, alignItems:"center" }}>
                    {item.price ? <span style={{ color:"#22c55e", fontSize:12, fontWeight:600 }}>${item.price}</span> : <span style={{ color:"rgba(255,255,255,0.25)", fontSize:12 }}>No price</span>}
                    {item.category ? <span style={{ color:"rgba(255,255,255,0.4)", fontSize:11 }}>{item.category}</span> : <span style={{ color:"rgba(255,255,255,0.2)", fontSize:11 }}>No category</span>}
                    {item.photoCount>1 && <span style={{ color:"rgba(255,255,255,0.3)", fontSize:11 }}>×{item.photoCount} photos</span>}
                  </div>
                </div>
                {/* Confidence badge */}
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2, flexShrink:0 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:confColor(conf) }} />
                  <span style={{ color:confColor(conf), fontSize:10, fontWeight:600 }}>{confLabel(conf)}</span>
                </div>
                {/* Expand arrow */}
                <span style={{ color:"rgba(255,255,255,0.25)", fontSize:14 }}>{isEditing?"▲":"▼"}</span>
              </div>

              {/* EDIT PANEL */}
              {isEditing && (
                <div style={{ borderTop:"1px solid rgba(255,255,255,0.07)", padding:"14px 16px", display:"flex", flexDirection:"column", gap:14 }}>

                  {/* AI confidence note */}
                  {conf!=null && conf<80 && (
                    <div style={{ background: conf<55?"rgba(239,68,68,0.1)":"rgba(245,158,11,0.1)", border:`1px solid ${conf<55?"rgba(239,68,68,0.3)":"rgba(245,158,11,0.3)"}`, borderRadius:10, padding:"8px 12px", fontSize:12, color: conf<55?"#fca5a5":"#fcd34d" }}>
                      {conf<55 ? `⚠ Low AI confidence (${conf}%) — title and category may be wrong. Please review.` : `◐ AI is ${conf}% confident — worth a quick check.`}
                    </div>
                  )}

                  {/* Title + Price row */}
                  <div style={{ display:"flex", gap:10 }}>
                    <div style={{ flex:2 }}>
                      <label style={{ color:"rgba(255,255,255,0.4)", fontSize:11, display:"block", marginBottom:4 }}>Title</label>
                      <input value={item.label} onChange={e=>updateItem(item.id,{label:e.target.value})} style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8, padding:"7px 10px", color:"white", fontSize:13, boxSizing:"border-box" }} />
                    </div>
                    <div style={{ flex:1 }}>
                      <label style={{ color:"rgba(255,255,255,0.4)", fontSize:11, display:"block", marginBottom:4 }}>Price ($)</label>
                      <input value={item.price} onChange={e=>updateItem(item.id,{price:e.target.value})} placeholder="0.00" style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8, padding:"7px 10px", color:"white", fontSize:13, boxSizing:"border-box" }} />
                    </div>
                  </div>

                  {/* Photo tools row */}
                  <div>
                    <label style={{ color:"rgba(255,255,255,0.4)", fontSize:11, display:"block", marginBottom:8 }}>Photo tools</label>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>

                      {/* Aspect ratio */}
                      <div style={{ display:"flex", gap:4 }}>
                        {ASPECTS.map(a => (
                          <button key={a} onClick={()=>updateItem(item.id,{aspect:a})} style={{ padding:"5px 10px", borderRadius:8, border:"none", cursor:"pointer", fontSize:11, fontWeight:600, background:item.aspect===a?"rgba(245,158,11,0.9)":"rgba(255,255,255,0.08)", color:item.aspect===a?"#000":"rgba(255,255,255,0.6)", transition:"all 0.15s" }}>
                            {a}
                          </button>
                        ))}
                      </div>

                      {/* Background removal */}
                      <button onClick={()=>updateItem(item.id,{bgRemoved:!item.bgRemoved})} style={{ padding:"5px 12px", borderRadius:8, border:"none", cursor:"pointer", fontSize:11, fontWeight:600, background:item.bgRemoved?"rgba(167,139,250,0.25)":"rgba(255,255,255,0.08)", color:item.bgRemoved?"#c4b5fd":"rgba(255,255,255,0.6)" }}>
                        {item.bgRemoved?"✂ BG removed":"✂ Remove BG"}
                      </button>

                      {/* Auto enhance */}
                      <button onClick={()=>updateItem(item.id,{enhanced:!item.enhanced})} style={{ padding:"5px 12px", borderRadius:8, border:"none", cursor:"pointer", fontSize:11, fontWeight:600, background:item.enhanced?"rgba(124,58,237,0.25)":"rgba(255,255,255,0.08)", color:item.enhanced?"#a78bfa":"rgba(255,255,255,0.6)" }}>
                        {item.enhanced?"✨ Enhanced":"✨ Auto-enhance"}
                      </button>
                    </div>
                  </div>

                  {/* Brightness / Contrast sliders */}
                  <div style={{ display:"flex", gap:16 }}>
                    {[["brightness","☀ Brightness"],["contrast","◑ Contrast"]].map(([key,lbl])=>(
                      <div key={key} style={{ flex:1 }}>
                        <label style={{ color:"rgba(255,255,255,0.4)", fontSize:11, display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                          <span>{lbl}</span>
                          <span style={{ color:"rgba(255,255,255,0.6)" }}>{item[key]??50}</span>
                        </label>
                        <input type="range" min={0} max={100} value={item[key]??50} onChange={e=>updateItem(item.id,{[key]:Number(e.target.value)})} style={{ width:"100%", accentColor:"#f59e0b" }} />
                      </div>
                    ))}
                  </div>

                  {/* Photo count note */}
                  {item.photoCount>1 && (
                    <div style={{ color:"rgba(255,255,255,0.3)", fontSize:11 }}>
                      {item.photoCount} photos captured · tools apply to primary photo
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* BULK PANEL */}
      {bulkPanel && (
        <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.7)", zIndex:40, display:"flex", alignItems:"flex-end" }}>
          <div style={{ width:"100%", background:"#1a1a1a", borderRadius:"20px 20px 0 0", padding:"20px 20px 32px", border:"1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
              <span style={{ color:"white", fontSize:16, fontWeight:600 }}>{bulkPanel==="price"?"Set price for":"Set category for"} {selectedIds.size} items</span>
              <button onClick={()=>setBulkPanel(false)} style={{ color:"rgba(255,255,255,0.4)", background:"none", border:"none", fontSize:20, cursor:"pointer" }}>×</button>
            </div>
            {bulkPanel==="price" && (
              <div style={{ display:"flex", gap:10 }}>
                <input placeholder="Enter price…" style={{ flex:1, background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:10, padding:"10px 14px", color:"white", fontSize:14 }} />
                <button onClick={()=>{setBulkPanel(false);clearSelect();}} style={{ background:"#f59e0b", color:"#000", border:"none", borderRadius:10, padding:"10px 20px", fontSize:14, fontWeight:700, cursor:"pointer" }}>Apply</button>
              </div>
            )}
            {bulkPanel==="category" && (
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {["Furniture","Décor","Art","Clothing","Jewelry","Collectibles","Electronics","Kitchen","Books","Other"].map(cat=>(
                  <button key={cat} onClick={()=>{setCaptured(p=>p.map(i=>selectedIds.has(i.id)?{...i,category:cat}:i));setBulkPanel(false);clearSelect();}} style={{ padding:"8px 14px", borderRadius:20, border:"1px solid rgba(255,255,255,0.15)", background:"rgba(255,255,255,0.06)", color:"rgba(255,255,255,0.8)", fontSize:13, cursor:"pointer" }}>
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* BUYER PREVIEW */}
      {buyerPreview && (
        <div style={{ position:"absolute", inset:0, background:"#f5f5f5", zIndex:40, display:"flex", flexDirection:"column", fontFamily:f }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 20px", background:"white", borderBottom:"1px solid #e5e7eb" }}>
            <button onClick={()=>setBuyerPreview(false)} style={{ color:"#6b7280", background:"none", border:"none", fontSize:14, cursor:"pointer" }}>← Back to editing</button>
            <span style={{ color:"#111", fontSize:15, fontWeight:600 }}>Buyer view preview</span>
            <span style={{ color:"#f59e0b", fontSize:12, fontWeight:600, background:"rgba(245,158,11,0.1)", padding:"4px 10px", borderRadius:12 }}>Preview only</span>
          </div>
          <div style={{ padding:"16px", overflowY:"auto", flex:1 }}>
            <div style={{ color:"#374151", fontSize:13, marginBottom:12, fontWeight:500 }}>Downtown Downsizing — items for sale</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
              {captured.filter(i=>i.status==="complete").map(item=>(
                <div key={item.id} style={{ background:"white", borderRadius:12, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,0.1)" }}>
                  <div style={{ height:120, background: item.bgRemoved?"#f9f9f9":"#e5e7eb", display:"flex", alignItems:"center", justifyContent:"center", fontSize:44, border: item.bgRemoved?"2px dashed #e5e7eb":"none" }}>
                    {item.thumb}
                  </div>
                  <div style={{ padding:"10px 12px" }}>
                    <div style={{ fontSize:13, fontWeight:500, color:"#111", marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.label}</div>
                    {item.price ? <div style={{ fontSize:15, fontWeight:700, color:"#059669" }}>${item.price}</div> : <div style={{ fontSize:13, color:"#9ca3af" }}>Price TBD</div>}
                    {item.category && <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>{item.category}</div>}
                    <div style={{ display:"flex", gap:4, marginTop:6, flexWrap:"wrap" }}>
                      {item.enhanced && <span style={{ fontSize:10, background:"#f3e8ff", color:"#7c3aed", padding:"2px 6px", borderRadius:6 }}>✨ Enhanced</span>}
                      {item.bgRemoved && <span style={{ fontSize:10, background:"#ede9fe", color:"#6d28d9", padding:"2px 6px", borderRadius:6 }}>✂ Clean BG</span>}
                      {item.aspect!=="4:3" && <span style={{ fontSize:10, background:"#e0f2fe", color:"#0369a1", padding:"2px 6px", borderRadius:6 }}>{item.aspect}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
