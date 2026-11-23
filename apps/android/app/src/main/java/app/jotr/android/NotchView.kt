package app.jotr.android

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.view.View
import android.view.animation.DecelerateInterpolator

/**
 * The floating notch: a black panel that hangs from the camera cut-out and shows
 * two lines of the script. The current word is lit and underlined; said words are
 * bright, upcoming ones dim; the next line fades below. Lines glide up as you read.
 */
@SuppressLint("ViewConstructor")
class NotchView(context: Context, private val words: List<String>, textSizeSp: Float) : View(context) {
    private val density = resources.displayMetrics.density
    private fun dp(v: Float) = v * density

    /** Space above the text for the camera cut-out (set from the display cutout). */
    var cameraInset = dp(26f)
        set(value) {
            field = value
            requestLayout()
        }

    /** True while the notch sits at the top edge (flat top); rounded all round when dragged away. */
    var docked = true
        set(value) {
            field = value
            invalidate()
        }

    var paused = false
        set(value) {
            field = value
            invalidate()
        }

    var listening = false
        set(value) {
            field = value
            invalidate()
        }

    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
        textSize = textSizeSp * resources.displayMetrics.scaledDensity
    }
    private val bg = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK }
    private val caret = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF5AA9FF.toInt() }
    private val underline = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF5AA9FF.toInt() }
    private val glow = Paint(Paint.ANTI_ALIAS_FLAG)
    private val fade = Paint(Paint.ANTI_ALIAS_FLAG)
    private val camera = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF1C2433.toInt() }
    private val dot = Paint(Paint.ANTI_ALIAS_FLAG)
    private val path = Path()
    private val rect = RectF()

    private val lineHeight get() = text.textSize * 1.42f
    private val padX get() = dp(18f)
    private val padBottom get() = dp(14f)

    /** Lines as word-index ranges [start, end). */
    private var lines: List<IntRange> = emptyList()
    private var position = 0
    private var shownLine = 0
    private var scroll = 0f // 0..1 while gliding to the next line
    private var glide: ValueAnimator? = null

    fun setPosition(index: Int) {
        position = index.coerceIn(0, words.size)
        val line = lineOf(position)
        if (line != shownLine) {
            val from = shownLine
            shownLine = line
            glide?.cancel()
            if (line == from + 1) {
                // Glide up one line.
                glide = ValueAnimator.ofFloat(1f, 0f).apply {
                    duration = 320
                    interpolator = DecelerateInterpolator()
                    addUpdateListener {
                        scroll = it.animatedValue as Float
                        invalidate()
                    }
                    start()
                }
            } else {
                scroll = 0f
            }
        }
        invalidate()
    }

    private fun lineOf(index: Int): Int {
        if (lines.isEmpty()) return 0
        val i = index.coerceAtMost(words.size - 1).coerceAtLeast(0)
        return lines.indexOfFirst { i in it }.coerceAtLeast(0)
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val w = MeasureSpec.getSize(widthMeasureSpec)
        val h = (cameraInset + lineHeight * 2 + padBottom).toInt()
        setMeasuredDimension(w, h)
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        wrap(w - padX * 2 - dp(10f))
        shownLine = lineOf(position)
        glow.shader = RadialGradient(w / 2f, h.toFloat(), w * 0.42f, 0x6650A0FF, 0x0050A0FF, Shader.TileMode.CLAMP)
        fade.shader = LinearGradient(0f, cameraInset + lineHeight, 0f, h.toFloat(), 0x00000000, 0xFF000000.toInt(), Shader.TileMode.CLAMP)
    }

    /** Greedy word wrap to the notch's width. */
    private fun wrap(width: Float) {
        val out = ArrayList<IntRange>()
        val space = text.measureText(" ")
        var start = 0
        var x = 0f
        for (i in words.indices) {
            val ww = text.measureText(words[i])
            if (i > start && x + ww > width) {
                out.add(start until i)
                start = i
                x = 0f
            }
            x += ww + space
        }
        if (start < words.size) out.add(start until words.size)
        lines = out
    }

    override fun onDraw(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        // Panel: flat top against the screen edge (like the camera housing), rounded bottom.
        val r = dp(22f)
        rect.set(0f, 0f, w, h)
        path.reset()
        if (docked) {
            path.addRoundRect(rect, floatArrayOf(0f, 0f, 0f, 0f, r, r, r, r), Path.Direction.CW)
        } else {
            path.addRoundRect(rect, r, r, Path.Direction.CW)
        }
        canvas.drawPath(path, bg)
        canvas.save()
        canvas.clipPath(path)
        canvas.drawRect(0f, h * 0.5f, w, h, glow)

        // Camera dot, and a status light: green listening, amber paused.
        val cy = minOf(dp(10f), cameraInset / 2f)
        if (docked) canvas.drawCircle(w / 2f, cy, dp(4.2f), camera)
        dot.color = when {
            paused -> 0xFFFFB020.toInt()
            listening -> 0xFF2EE6A6.toInt()
            else -> 0xFF5AA9FF.toInt()
        }
        canvas.drawCircle(w / 2f + dp(12f), cy, dp(2.4f), dot)

        // Caret
        val baseTop = cameraInset
        val caretTop = baseTop + lineHeight * 0.18f
        canvas.drawRoundRect(padX - dp(9f), caretTop, padX - dp(6f), caretTop + lineHeight * 0.72f, dp(2f), dp(2f), caret)

        // Two visible lines, gliding up by `scroll` of a line.
        val first = (shownLine - 1).coerceAtLeast(0)
        for (li in first..minOf(shownLine + 2, lines.size - 1)) {
            val y = baseTop + (li - shownLine + scroll) * lineHeight + text.textSize
            if (y < baseTop - lineHeight || y > h + lineHeight) continue
            var x = padX
            for (i in lines[li]) {
                val word = words[i]
                text.color = when {
                    li > shownLine -> 0x55FFFFFF
                    i < position -> 0xFFFFFFFF.toInt()
                    i == position -> 0xFFFFFFFF.toInt()
                    else -> 0xA6FFFFFF.toInt()
                }
                if (li < shownLine) text.color = 0x33FFFFFF
                canvas.drawText(word, x, y, text)
                val ww = text.measureText(word)
                if (i == position && !paused) {
                    canvas.drawRoundRect(x, y + dp(4f), x + ww, y + dp(6.5f), dp(1.5f), dp(1.5f), underline)
                }
                x += ww + text.measureText(" ")
            }
        }
        // Fade the next line out, and anything above the first line under the camera band.
        canvas.drawRect(0f, baseTop + lineHeight, w, h, fade)
        bg.alpha = 255
        canvas.drawRect(0f, 0f, w, baseTop - dp(2f), bg)
        if (docked) canvas.drawCircle(w / 2f, cy, dp(4.2f), camera)
        canvas.drawCircle(w / 2f + dp(12f), cy, dp(2.4f), dot)
        canvas.restore()
    }
}
