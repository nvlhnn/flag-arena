$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$arenaRoot = Split-Path -Parent $PSScriptRoot
$arenaOutput = Join-Path $arenaRoot 'public/audio/en'
New-Item -ItemType Directory -Force -Path $arenaOutput | Out-Null
$arenaCountries = & node --import tsx -e "import {countries} from './lib/arena.ts'; process.stdout.write(JSON.stringify(countries));" | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Unable to read countries' }
$arenaSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
 $arenaSynth.SelectVoice('Microsoft David Desktop')
 $arenaSynth.Rate = 0
 $arenaFormat = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
 $arenaLines = @{}
 foreach ($arenaCountry in $arenaCountries) { $arenaLines[$arenaCountry.code] = $arenaCountry.name }
 foreach ($arenaShortName in @{IR='Iran';KR='South Korea';KP='North Korea';US='United States';GB='United Kingdom';RU='Russia';VN='Vietnam';TW='Taiwan';SY='Syria';BO='Bolivia';VE='Venezuela';TZ='Tanzania';LA='Laos';BN='Brunei';MD='Moldova';PS='Palestine'}.GetEnumerator()) { $arenaLines[$arenaShortName.Key] = $arenaShortName.Value }
 $arenaLines['takes-the-lead'] = 'takes the lead!'
 $arenaLines['overtakes'] = 'overtakes'
 $arenaLines['and'] = 'and'
 for ($arenaOthers=2; $arenaOthers -lt $arenaCountries.Count; $arenaOthers++) { $arenaLines["and-$arenaOthers-others"] = "and $arenaOthers other countries!" }
 $arenaLines['enters-the-top-five'] = 'enters the top five!'
 $arenaLines['wins'] = 'wins!'
 $arenaLines['thanks-subscribing'] = 'Thank you for subscribing!'
 $arenaLines['subscriber-bonus'] = 'gets fifty points!'
 for ($arenaJump=2; $arenaJump -lt $arenaCountries.Count; $arenaJump++) { $arenaLines["moves-up-$arenaJump"] = "moves up $arenaJump places!" }
 foreach ($arenaEntry in $arenaLines.GetEnumerator()) {
  $arenaSynth.SetOutputToWaveFile((Join-Path $arenaOutput ($arenaEntry.Key + '.wav')), $arenaFormat)
  $arenaSynth.Speak($arenaEntry.Value)
  $arenaSynth.SetOutputToNull()
 }
 Write-Output "Generated $($arenaLines.Count) English voice clips."
} finally { $arenaSynth.Dispose() }
