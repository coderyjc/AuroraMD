use std::collections::BTreeSet;

use crate::domain::{AppResult, SystemFont};

pub fn compose_font_family(
    latin_font_family: &str,
    cjk_font_family: &str,
    fallback: &str,
) -> String {
    let mut families = Vec::new();
    for family in split_font_family_stack(latin_font_family)
        .into_iter()
        .chain(split_font_family_stack(cjk_font_family))
    {
        if is_generic_font_family(&family) {
            continue;
        }
        let normalized = family.trim().to_string();
        if normalized.is_empty() || families.iter().any(|item| item == &normalized) {
            continue;
        }
        families.push(normalized);
    }
    families.push(fallback.to_string());
    families.join(", ")
}

fn split_font_family_stack(value: &str) -> Vec<String> {
    let mut families = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut escaped = false;

    for character in value.chars() {
        if escaped {
            current.push(character);
            escaped = false;
            continue;
        }
        if character == '\\' {
            current.push(character);
            escaped = true;
            continue;
        }
        if let Some(quote_character) = quote {
            current.push(character);
            if character == quote_character {
                quote = None;
            }
            continue;
        }
        if character == '"' || character == '\'' {
            current.push(character);
            quote = Some(character);
            continue;
        }
        if character == ',' {
            let trimmed = current.trim();
            if !trimmed.is_empty() {
                families.push(trimmed.to_string());
            }
            current.clear();
            continue;
        }
        current.push(character);
    }

    let trimmed = current.trim();
    if !trimmed.is_empty() {
        families.push(trimmed.to_string());
    }
    families
}

fn is_generic_font_family(family: &str) -> bool {
    matches!(
        family
            .trim()
            .trim_matches('"')
            .trim_matches('\'')
            .to_ascii_lowercase()
            .as_str(),
        "serif" | "sans-serif" | "monospace" | "cursive" | "fantasy" | "system-ui"
    )
}

pub fn collect_system_fonts() -> AppResult<Vec<SystemFont>> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;

        let script = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'SilentlyContinue'
$names = New-Object System.Collections.Generic.List[string]
$usedRegistryFallback = $false
try {
  Add-Type -AssemblyName System.Drawing
  $collection = New-Object System.Drawing.Text.InstalledFontCollection
  foreach ($family in $collection.Families) {
    if ($family.Name) { $names.Add($family.Name) }
  }
} catch {}
if ($names.Count -eq 0) {
  $usedRegistryFallback = $true
  $registryPaths = @(
    'Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows NT\CurrentVersion\Fonts',
    'Registry::HKEY_LOCAL_MACHINE\Software\Microsoft\Windows NT\CurrentVersion\Fonts'
  )
  foreach ($path in $registryPaths) {
    if (Test-Path $path) {
      $item = Get-ItemProperty -Path $path
      foreach ($property in $item.PSObject.Properties) {
        if ($property.Name -notlike 'PS*') { $names.Add($property.Name) }
      }
    }
  }
}
$stylePattern = '\s+(Regular|Italic|Bold|Bold Italic|Light|ExtraLight|SemiLight|Medium|SemiBold|DemiBold|ExtraBold|Black|Thin|Heavy|Condensed|Narrow|Oblique)$'
$names |
  ForEach-Object {
    $clean = $_ -replace '\s*\((TrueType|OpenType|Type 1|Raster|Vector)\)\s*$', ''
    if ($usedRegistryFallback) { $clean = $clean -replace $stylePattern, '' }
    $clean
  } |
  Where-Object { $_ -and $_.Trim().Length -gt 0 } |
  Sort-Object -Unique |
  ForEach-Object { [Console]::Out.WriteLine($_.Trim()) }
"#;

        let output = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-Command", script])
            .creation_flags(0x08000000)
            .output()
            .map_err(|error| format!("Failed to read system fonts: {error}"))?;

        if !output.status.success() {
            return Err(format!(
                "Failed to read system fonts: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        return Ok(normalize_system_fonts(
            String::from_utf8_lossy(&output.stdout).lines(),
        ));
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(normalize_system_fonts([
            "Arial",
            "Georgia",
            "Helvetica",
            "Times New Roman",
            "Verdana",
        ]))
    }
}

fn normalize_system_fonts<'a, I>(font_names: I) -> Vec<SystemFont>
where
    I: IntoIterator<Item = &'a str>,
{
    let mut families = BTreeSet::new();
    for name in font_names {
        let family = name.trim();
        if !family.is_empty() {
            families.insert(family.to_string());
        }
    }

    families
        .into_iter()
        .map(|family| SystemFont { family })
        .collect()
}
