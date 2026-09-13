$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
$arenaSpeechJob = [Console]::In.ReadToEnd() | ConvertFrom-Json
if (-not $arenaSpeechJob.text -or $arenaSpeechJob.text.Length -gt 180) { throw 'Invalid speech text' }
Add-Type -AssemblyName System.Speech
$arenaSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $arenaVoice = $arenaSynth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like 'en-*' } | Select-Object -First 1
  if (-not $arenaVoice) { throw 'No English Windows voice installed' }
  $arenaSynth.SelectVoice($arenaVoice.VoiceInfo.Name)
  $arenaSynth.Rate = 0
  $arenaFormat = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
  $arenaSynth.SetOutputToWaveFile($arenaSpeechJob.output, $arenaFormat)
  # Speak plain text. Donor names are never interpreted as PowerShell or SSML.
  $arenaSynth.Speak([string]$arenaSpeechJob.text)
  $arenaSynth.SetOutputToNull()
} finally { $arenaSynth.Dispose() }
