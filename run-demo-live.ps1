# ==============================================================================
# ELIX OS Native App Runtime & Dynamic App Bridge — Live Interactive Showcase
# ==============================================================================

$wshell = New-Object -ComObject wscript.shell

# 1. Start a fresh visible PowerShell process
Write-Host "Opening live demonstration window..." -ForegroundColor Cyan
$proc = Start-Process powershell -ArgumentList "-NoExit" -PassThru
Start-Sleep -Seconds 2

# Bring the window to front
$wshell.AppActivate($proc.Id)
Start-Sleep -Milliseconds 500

# Helper function to visibly type characters with realistic delay
function Send-Typing {
    param([string]$text, [int]$delayMs = 35)
    foreach ($char in $text.ToCharArray()) {
        $wshell.SendKeys([string]$char)
        Start-Sleep -Milliseconds $delayMs
    }
    Start-Sleep -Milliseconds 250
    $wshell.SendKeys("{ENTER}")
    Start-Sleep -Seconds 2
}

# 1. Navigate to directory and set execution policy
Send-Typing "cd 'C:\Users\S.LAKSHMI NARAYANA\.gemini\antigravity\scratch\elix\packages\apps\app-bridge'"
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
Send-Typing "fixtures/com.elix.fakeapp" 50
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

# 7. Step 4: Close window and Exit
Send-Typing "10"
Start-Sleep -Seconds 2
Send-Typing "1"
Start-Sleep -Seconds 2
Send-Typing "11"

Write-Host "Live showcase completed successfully." -ForegroundColor Green
