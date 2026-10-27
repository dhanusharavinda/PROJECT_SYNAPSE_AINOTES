Add-Type -AssemblyName System.Drawing
$size = 512
$bitmap = New-Object System.Drawing.Bitmap($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(36, 83, 68))
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(243, 237, 218), 32)
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$points = [System.Drawing.Point[]]@(
  (New-Object System.Drawing.Point(128, 126)),
  (New-Object System.Drawing.Point(220, 126)),
  (New-Object System.Drawing.Point(312, 256)),
  (New-Object System.Drawing.Point(220, 386)),
  (New-Object System.Drawing.Point(128, 386))
)
$graphics.DrawLines($pen, $points)
$graphics.DrawLine($pen, 312, 126, 384, 126)
$graphics.DrawLine($pen, 312, 386, 384, 386)
$sage = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(214, 232, 189))
$gold = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 217, 154))
$graphics.FillEllipse($sage, 103, 101, 50, 50)
$graphics.FillEllipse($sage, 103, 361, 50, 50)
$graphics.FillEllipse($gold, 359, 101, 50, 50)
$graphics.FillEllipse($gold, 359, 361, 50, 50)
$target = Join-Path $PSScriptRoot "..\build\icon.png"
$bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
$sage.Dispose()
$gold.Dispose()
$pen.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
Write-Output $target
