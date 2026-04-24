let _offset = 0

export function drawMarchingAnts(ctx, state) {
  if (!state.selection) return
  const { type, bounds, points } = state.selection
  const z = state.zoom
  const dash = 4 / z
  const lw = 1 / z
  _offset = (_offset + 0.4) % (dash * 2)

  function drawShape(dashOffset) {
    ctx.save()
    ctx.lineWidth = lw
    ctx.setLineDash([dash, dash])
    ctx.lineDashOffset = dashOffset
    ctx.beginPath()
    if (type === 'rect' || type === 'mask') {
      ctx.rect(bounds.x, bounds.y, bounds.w, bounds.h)
    } else if (type === 'ellipse') {
      ctx.ellipse(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, bounds.w / 2, bounds.h / 2, 0, 0, Math.PI * 2)
    } else if (type === 'lasso' && points?.length > 1) {
      ctx.moveTo(points[0].x, points[0].y)
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
      ctx.closePath()
    }
    ctx.stroke()
    ctx.restore()
  }

  ctx.strokeStyle = '#ffffff'
  drawShape(-_offset)
  ctx.strokeStyle = '#000000'
  drawShape(-_offset - dash)
}

export function tickMarchingAnts() {
  _offset = (_offset + 0.4) % 16
}
