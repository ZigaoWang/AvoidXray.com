import { sprocketStrip, drawnLongEdge, SPROCKET_SHEET_MARGIN } from '../src/lib/watermark/render'
import { printPlan, maxScale, ORIGINAL_LONG_EDGE, PRINT_INSET, scaleFor } from '../src/lib/exportFormats'

const PRINT_OVERHEAD = 1.35
const frames = [
  { name: '7956x5300 (42MP)', w: 7956, h: 5300 },
  { name: '2400x876 pano', w: 2400, h: 876 },
  { name: '2000x2000 square', w: 2000, h: 2000 },
  { name: '240x180 tiny', w: 240, h: 180 },
]

function instant(scale: number, srcW: number, srcH: number) {
  const aspect = srcW / srcH
  const picW = Math.round(Math.min(ORIGINAL_LONG_EDGE * scale, Math.max(srcW, srcH)) * Math.min(1, aspect))
  const picH = Math.max(1, Math.round(picW / aspect))
  const border = Math.max(1, Math.round(Math.min(picW * 0.057, picH * 0.09)))
  const chin = Math.max(1, Math.round(Math.min(picW * 0.297, picH * 0.40)))
  return { picW, picH, border, chin, cardW: picW + border * 2, cardH: picH + border + chin }
}
function slide(scale: number, srcW: number, srcH: number) {
  const board = Math.round(Math.min(ORIGINAL_LONG_EDGE * scale, Math.max(srcW, srcH)))
  const outer = Math.round(board * 0.045)
  const mount = board - outer * 2
  return { board, mount }
}
function cleanCanvas(scale: number, srcW: number, srcH: number, ratio = 0.043) {
  const fit = Math.min(1, (ORIGINAL_LONG_EDGE * scale) / Math.max(srcW, srcH))
  const w = Math.round(srcW * fit), h = Math.round(srcH * fit)
  const margin = Math.min(Math.round(Math.max(w, h) * ratio), Math.round(Math.min(w, h) * 0.35))
  return { w: w + margin * 2, photoH: h, margin }
}
function strip(scale: number, srcW: number, srcH: number) {
  const s = sprocketStrip(scale, srcW, srcH)
  const g = 1 + SPROCKET_SHEET_MARGIN * 2
  return { ...s, canvasW: Math.round(s.upright.w * g), canvasH: Math.round(s.upright.h * g) }
}

for (const f of frames) {
  const landscape = f.w > f.h
  const ceiling = maxScale('original', f.w, f.h, landscape, false)
  console.log(`\n=== ${f.name}  landscape=${landscape} ceiling=${ceiling.toFixed(4)} ===`)
  for (const label of ['preview scale=1', 'post full', 'print 4x6', 'print 5x7', 'print 8x10'] as const) {
    let scale = 1
    let sheet: { w: number; h: number; dpi: number } | null = null
    if (label === 'post full') scale = Math.min(scaleFor('full', 'original', ceiling), ceiling)
    if (label.startsWith('print')) {
      const id = label.split(' ')[1] as '4x6' | '5x7' | '8x10'
      sheet = printPlan(id, landscape, f.w, f.h)
      scale = Math.min(ceiling, (Math.max(sheet.w, sheet.h) / ORIGINAL_LONG_EDGE) * PRINT_OVERHEAD)
    }
    const st = strip(scale, f.w, f.h)
    const ins = instant(scale, f.w, f.h)
    const sl = slide(scale, f.w, f.h)
    const cl = cleanCanvas(scale, f.w, f.h)
    const mp = (w: number, h: number) => ((w * h) / 1e6).toFixed(1)
    console.log(` ${label}: scale=${scale.toFixed(4)}${sheet ? ` sheet=${sheet.w}x${sheet.h} @${sheet.dpi}dpi (${mp(sheet.w, sheet.h)}MP)` : ''}`)
    console.log(`   clean   canvasW=${cl.w} photoH=${cl.photoH} margin=${cl.margin}`)
    console.log(`   strip   W=${st.width} len=${st.length} imgH=${st.imageHeight} upright=${st.upright.w}x${st.upright.h} canvas=${st.canvasW}x${st.canvasH} (${mp(st.canvasW, st.canvasH)}MP) srcShortCap=${Math.round(Math.min(f.w,f.h)/0.686)} enlargesSource=${st.length > Math.max(f.w,f.h)}`)
    console.log(`   instant pic=${ins.picW}x${ins.picH} border=${ins.border} chin=${ins.chin} card=${ins.cardW}x${ins.cardH} (${mp(ins.cardW, ins.cardH)}MP) cardTexture=${ins.cardW >= 320 && ins.cardH >= 320} grain=${ins.cardW >= 256 && ins.cardH >= 256}`)
    console.log(`   slide   board=${sl.board} mount=${sl.mount} (${mp(sl.board, sl.board)}MP)`)
    console.log(`   drawnLongEdge: clean=${drawnLongEdge('clean','original',scale,landscape,45,f.w,f.h)} instant=${drawnLongEdge('instant','original',scale,landscape,45,f.w,f.h)} slide=${drawnLongEdge('slide','original',scale,landscape,45,f.w,f.h)} sprocket=${drawnLongEdge('sprocket','original',scale,landscape,45,f.w,f.h)}`)
  }
  // contact sheet
  const s = 0.35
  const st = strip(s, f.w, f.h), ins = instant(s, f.w, f.h), sl = slide(s, f.w, f.h), cl = cleanCanvas(s, f.w, f.h, 0.30 - (55/100)*0.295)
  console.log(` contact sheet scale=0.35:`)
  console.log(`   strip W=${st.width} len=${st.length} canvas=${st.canvasW}x${st.canvasH} grain=${st.length>=256 && st.width>=256}`)
  console.log(`   instant card=${ins.cardW}x${ins.cardH} cardTexture=${ins.cardW>=320&&ins.cardH>=320} grain=${ins.cardW>=256&&ins.cardH>=256}`)
  console.log(`   slide mount=${sl.mount} cardTexture=${sl.mount>=320} grain=${sl.mount>=256}`)
  console.log(`   bare canvas=${cl.w}x${cl.photoH + 2*cl.margin} grain=${cl.w>=256 && (cl.photoH+2*cl.margin)>=256}`)
}
