$path = "c:\Users\Ishaa\Desktop\CompanyProjects\mobasket\frontend\src\module\user\pages\orders\OrderTracking.jsx"
$content = Get-Content $path
$newContent = $content[0..1682] + '          <div className="w-10 h-10" />' + $content[1689..($content.Length - 1)]
$newContent | Set-Content $path
