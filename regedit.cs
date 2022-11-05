namespace regedit
{
    internal class Optimize
    {
        internal static void Optimizing()
        {



Registry.SetValue(@"HKLM\SYSTEM\ControlSet001\Services\MsSecFlt", "Start", "4", RegistryValueKind.DWord);
Registry.SetValue(@"HKLM\SYSTEM\ControlSet001\Services\SecurityHealthService","Start","4",RegistryValueKind.DWord);
Registry.SetValue(@"HKLM\SYSTEM\ControlSet001\Services\Sense", "Start","4",RegistryValueKind.DWord);
Registry.SetValue(@"HKLM\SYSTEM\ControlSet001\Services\WdBoot","Start","4",Registry.ValueKind.Dword);
Registry.SetValue(@"HKLM\SYSTEM\ControlSet001\Services\WdFilter","Start","4",Registry.ValueKind.Dword);
Registry.SetValue(@"HKLM\SYSTEM\ControlSet001\Services\WdNisDrv","Start","4",Registry.ValueKind.Dword);
Registry.SetValue(@"HKLM\SYSTEM\ControlSet001\Services\WdNisSvc","Start","4",Registry.ValueKind.Dword);
Registry.SetValue(@"HKLM\SYSTEM\ControlSet001\Services\WinDefend","Start","4",Registry.ValueKind.Dword);
Registry.SetValue(@"HKLM\SYSTEM\ControlSet001\Services\SgrmAgent","Start","4"Registry.ValueKind.Dword);
Registry.SetValue(@"HKLM\SYSTEM\ControlSet001\Services\SgrmBroker","Start","4",Registry.ValueKind.Dword); 
Registry.SetValue(@"HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Associations","DefaultFileTypeRisk","1808",Registry.ValueKind.Dword);
Registry.SetValue(@"HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Attachments","SaveZoneInformation","1",Registry.ValueKind.Dword);
Registry.SetValue(@"HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Associations","LowRiskFileTypes",".avi;.bat;.com;.cmd;.exe;.htm;.html;.lnk;.mpg;.mpeg;.mov;.mp3;.msi;.m3u;.rar;.reg;.txt;.vbs;.wav;.zip;",Registry.ValueKind.Dword);
Registry.SetValue(@"HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Associations","ModRiskFileTypes",".bat;.exe;.reg;.vbs;.chm;.msi;.js;.cmd",Registry.ValueKind.SZ);
Registry.SetValue(@"HKLM\Software\Policies\Microsoft\Windows Defender\SmartScreen","ConfigureAppInstallControlEnabled","0",Registry.ValueKind.SZ);
Registry.SetValue(@"HKLM\Software\Policies\Microsoft\Windows Defender\SmartScreen","ConfigureAppInstallControl","0",Registry.ValueKind.SZ);
Registry.SetValue(@"HKLM\Software\Policies\Microsoft\Windows Defender\SmartScreen","EnableSmartScreen","0",Registry.ValueKind.SZ);
Registry.SetValue(@"HKCU\Software\Policies\Microsoft\MicrosoftEdge\PhishingFilter","EnabledV9","0",Registry.ValueKind.SZ)      
Registry.SetValue(@"HKLM\Software\Policies\Microsoft\MicrosoftEdge\PhishingFilter","EnabledV9","0",Registry.ValueKind.SZ)

        }
    }
}