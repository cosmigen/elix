# ==============================================================================
# ELIX OS Native App Runtime & Dynamic App Bridge — Live Interactive Showcase
# ==============================================================================

$wshell = New-Object -ComObject wscript.shell

# 1. Start fresh visible PowerShell window
Write-Host "Launching visible showcase window..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit"
Start-Sleep -Seconds 2

# Helper function to type visibly with realistic keystroke delay
function Send-Typing {
    param([string]$text, [int]$delayMs = 40)
    foreach ($char in $text.ToCharArray()) {
        $wshell.SendKeys([string]$char)
        Start-Sleep -Milliseconds $delayMs
    }
    Start-Sleep -Milliseconds 200
    $wshell.SendKeys("{ENTER}")
    Start-Sleep -Seconds 2
}

# 1. Navigate to app-bridge package directory and set execution policy
Send-Typing "cd '$PSScriptRoot\packages\apps\app-bridge'"
Send-Typing "Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass"

# 2. Check TypeScript compilation (clean build proof)
Send-Typing "npx tsc --noEmit"
Start-Sleep -Seconds 3

# 3. Launch TUI harness
Send-Typing "npx tsx src/tui/test-harness.ts"
Start-Sleep -Seconds 4

# 4. Step 1: List Installed Apps
Send-Typing "1"
Start-Sleep -Seconds 2
Send-Typing "1"
Start-Sleep -Seconds 3

# 5. Step 2: Install fake app package
Send-Typing "5"
Start-Sleep -Seconds 2
Send-Typing "fixtures/com.elix.fakeapp" 60
Start-Sleep -Seconds 3
Send-Typing "y"
Start-Sleep -Seconds 3

# 6. Step 3: Execute tool capability
Send-Typing "4"
Start-Sleep -Seconds 2
Send-Typing "1"
Start-Sleep -Seconds 2
$wshell.SendKeys("{ENTER}")
Start-Sleep -Seconds 3

# 7. Step 4: Close and Exit
Send-Typing "10"
Start-Sleep -Seconds 2
Send-Typing "1"
Start-Sleep -Seconds 2
Send-Typing "11"

Write-Host "Showcase sequence completed." -ForegroundColor Green
