import BrushTool from './BrushTool.js'
import EraserTool from './EraserTool.js'
import MoveTool from './MoveTool.js'
import RectSelectTool from './RectSelectTool.js'
import EllipseSelectTool from './EllipseSelectTool.js'
import LassoTool from './LassoTool.js'
import MagicWandTool from './MagicWandTool.js'
import CropTool from './CropTool.js'
import FillTool from './FillTool.js'
import EyedropperTool from './EyedropperTool.js'
import TextTool from './TextTool.js'
import ShapeTool from './ShapeTool.js'
import GradientTool from './GradientTool.js'

export const ALL_TOOLS = [
  BrushTool, EraserTool, MoveTool,
  RectSelectTool, EllipseSelectTool, LassoTool, MagicWandTool,
  CropTool, FillTool, EyedropperTool, TextTool, ShapeTool, GradientTool,
]

const _registry = new Map(ALL_TOOLS.map(t => [t.id, t]))

export function getTool(id) {
  return _registry.get(id) ?? BrushTool
}

export const TOOL_GROUPS = [
  { tools: ['move'] },
  { tools: ['rect-select', 'ellipse-select', 'lasso', 'magic-wand'] },
  { tools: ['crop'] },
  { tools: ['brush', 'eraser', 'fill', 'gradient'] },
  { tools: ['eyedropper'] },
  { tools: ['text', 'shape'] },
]

export const TOOL_ICONS = {
  'move':          'mdi-cursor-move',
  'rect-select':   'mdi-selection',
  'ellipse-select':'mdi-select-compare',
  'lasso':         'mdi-lasso',
  'magic-wand':    'mdi-auto-fix',
  'crop':          'mdi-crop',
  'brush':         'mdi-brush',
  'eraser':        'mdi-eraser',
  'fill':          'mdi-format-color-fill',
  'gradient':      'mdi-gradient-horizontal',
  'eyedropper':    'mdi-eyedropper',
  'text':          'mdi-format-text',
  'shape':         'mdi-shape-outline',
}
