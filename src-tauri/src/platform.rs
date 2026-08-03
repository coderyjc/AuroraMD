use std::path::{Path, PathBuf};

use crate::domain::AppResult;
use crate::utils::now;

#[cfg(target_os = "windows")]
use windows::{
    core::{w, HRESULT, PCWSTR, PWSTR},
    Win32::{
        Foundation::ERROR_CANCELLED,
        System::Com::{
            CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER,
            COINIT_APARTMENTTHREADED,
        },
        UI::Shell::{
            Common::COMDLG_FILTERSPEC, FileOpenDialog, FileSaveDialog, IFileDialog,
            IFileOpenDialog, IFileSaveDialog, IShellItem, SHCreateItemFromParsingName,
            FOS_FILEMUSTEXIST, FOS_FORCEFILESYSTEM, FOS_NOCHANGEDIR, FOS_NOREADONLYRETURN,
            FOS_OVERWRITEPROMPT, FOS_PATHMUSTEXIST, FOS_PICKFOLDERS, SIGDN_FILESYSPATH,
        },
    },
};

#[tauri::command]
pub fn pick_book_folder() -> AppResult<Option<String>> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;

        let script = r#"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Select a Markdown book folder'
$dialog.ShowNewFolderButton = $false
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::Out.Write($dialog.SelectedPath)
}
"#;
        let output = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-STA", "-Command", script])
            .creation_flags(0x08000000)
            .output()
            .map_err(|error| format!("Failed to open folder picker: {error}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Folder picker failed: {stderr}"));
        }

        let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if selected.is_empty() {
            Ok(None)
        } else {
            Ok(Some(selected))
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(None)
    }
}

#[tauri::command]
pub fn pick_markdown_files() -> AppResult<Vec<String>> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;

        let script = r#"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = 'Select Markdown files'
$dialog.Filter = 'Markdown files (*.md)|*.md'
$dialog.Multiselect = $true
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::Out.Write((ConvertTo-Json -InputObject @($dialog.FileNames) -Compress))
}
"#;
        let output = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-STA", "-Command", script])
            .creation_flags(0x08000000)
            .output()
            .map_err(|error| format!("Failed to open Markdown file picker: {error}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Markdown file picker failed: {stderr}"));
        }

        let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if selected.is_empty() {
            return Ok(Vec::new());
        }
        parse_selected_path_list(&selected)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(Vec::new())
    }
}

fn parse_selected_path_list(raw: &str) -> AppResult<Vec<String>> {
    let selected = raw.trim().trim_start_matches('\u{feff}');
    if selected.is_empty() {
        return Ok(Vec::new());
    }
    if let Ok(paths) = serde_json::from_str::<Vec<String>>(selected) {
        return Ok(paths);
    }
    serde_json::from_str::<String>(selected)
        .map(|path| vec![path])
        .map_err(|error| format!("Failed to read selected Markdown files: {error}"))
}

pub fn open_folder_path(path: &PathBuf) -> AppResult<()> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;

        std::process::Command::new("explorer.exe")
            .arg(path)
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|error| format!("Failed to open folder in Explorer: {error}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|error| format!("Failed to open folder: {error}"))?;
        return Ok(());
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|error| format!("Failed to open folder: {error}"))?;
        Ok(())
    }
}

pub fn open_file_location(path: &PathBuf) -> AppResult<()> {
    if !path.is_file() {
        return Err("Chapter source file no longer exists.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;

        std::process::Command::new("explorer.exe")
            .arg(format!("/select,{}", path.to_string_lossy()))
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|error| format!("Failed to open chapter in Explorer: {error}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(path)
            .spawn()
            .map_err(|error| format!("Failed to open chapter file: {error}"))?;
        return Ok(());
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let parent = path
            .parent()
            .ok_or_else(|| "Chapter source folder no longer exists.".to_string())?;
        std::process::Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|error| format!("Failed to open chapter folder: {error}"))?;
        Ok(())
    }
}

pub fn open_external_url(url: &str) -> AppResult<()> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;

        std::process::Command::new("cmd.exe")
            .args(["/C", "start", "", url])
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|error| format!("Failed to open external link: {error}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|error| format!("Failed to open external link: {error}"))?;
        return Ok(());
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|error| format!("Failed to open external link: {error}"))?;
        Ok(())
    }
}

pub fn pick_backup_save_path() -> AppResult<Option<PathBuf>> {
    #[cfg(target_os = "windows")]
    {
        let timestamp = now()
            .chars()
            .filter(|char| char.is_ascii_digit())
            .take(14)
            .collect::<String>();
        let default_name = format!("auroramd-backup-{timestamp}.sqlite3");
        pick_windows_save_file("Export AuroraMD backup", &default_name)
            .map_err(|error| format!("Failed to open backup save dialog: {error}"))
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(None)
    }
}

pub fn pick_backup_open_path() -> AppResult<Option<PathBuf>> {
    #[cfg(target_os = "windows")]
    {
        pick_windows_open_file("Restore AuroraMD backup")
            .map_err(|error| format!("Failed to open backup file dialog: {error}"))
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(None)
    }
}

pub fn pick_auto_backup_directory_path() -> AppResult<Option<PathBuf>> {
    #[cfg(target_os = "windows")]
    {
        pick_windows_folder("Select AuroraMD automatic backup folder", None)
            .map_err(|error| format!("Failed to open auto backup folder picker: {error}"))
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(None)
    }
}

#[cfg(target_os = "windows")]
struct WindowsComGuard;

#[cfg(target_os = "windows")]
impl Drop for WindowsComGuard {
    fn drop(&mut self) {
        unsafe {
            CoUninitialize();
        }
    }
}

#[cfg(target_os = "windows")]
fn init_windows_dialog_com() -> AppResult<WindowsComGuard> {
    unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED)
            .ok()
            .map_err(|error| format!("Failed to initialize Windows dialog: {error}"))?;
    }
    Ok(WindowsComGuard)
}

#[cfg(target_os = "windows")]
fn pick_windows_save_file(title: &str, default_name: &str) -> AppResult<Option<PathBuf>> {
    let title = title.to_string();
    let default_name = default_name.to_string();
    std::thread::spawn(move || pick_windows_save_file_on_sta(&title, &default_name))
        .join()
        .map_err(|_| "Windows save dialog thread panicked.".to_string())?
}

#[cfg(target_os = "windows")]
fn pick_windows_save_file_on_sta(title: &str, default_name: &str) -> AppResult<Option<PathBuf>> {
    unsafe {
        let _com_guard = init_windows_dialog_com()?;
        let dialog: IFileSaveDialog = CoCreateInstance(&FileSaveDialog, None, CLSCTX_INPROC_SERVER)
            .map_err(|error| format!("Failed to create Windows save dialog: {error}"))?;
        let options = dialog
            .GetOptions()
            .map_err(|error| format!("Failed to read Windows save dialog options: {error}"))?;
        dialog
            .SetOptions(
                options
                    | FOS_FORCEFILESYSTEM
                    | FOS_PATHMUSTEXIST
                    | FOS_NOCHANGEDIR
                    | FOS_OVERWRITEPROMPT
                    | FOS_NOREADONLYRETURN,
            )
            .map_err(|error| format!("Failed to configure Windows save dialog: {error}"))?;
        configure_backup_file_dialog(&dialog, title)?;
        let default_name_wide = str_to_wide_null(default_name);
        dialog
            .SetFileName(PCWSTR(default_name_wide.as_ptr()))
            .map_err(|error| format!("Failed to set backup file name: {error}"))?;
        dialog
            .SetDefaultExtension(w!("sqlite3"))
            .map_err(|error| format!("Failed to set backup file extension: {error}"))?;

        if let Err(error) = dialog.Show(None) {
            if error.code() == HRESULT::from_win32(ERROR_CANCELLED.0) {
                return Ok(None);
            }
            return Err(format!("Windows save dialog failed: {error}"));
        }

        let result = dialog
            .GetResult()
            .map_err(|error| format!("Failed to read selected backup file: {error}"))?;
        shell_item_to_path(&result, "selected backup file")
    }
}

#[cfg(target_os = "windows")]
fn pick_windows_open_file(title: &str) -> AppResult<Option<PathBuf>> {
    let title = title.to_string();
    std::thread::spawn(move || pick_windows_open_file_on_sta(&title))
        .join()
        .map_err(|_| "Windows open dialog thread panicked.".to_string())?
}

#[cfg(target_os = "windows")]
fn pick_windows_open_file_on_sta(title: &str) -> AppResult<Option<PathBuf>> {
    unsafe {
        let _com_guard = init_windows_dialog_com()?;
        let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)
            .map_err(|error| format!("Failed to create Windows open dialog: {error}"))?;
        let options = dialog
            .GetOptions()
            .map_err(|error| format!("Failed to read Windows open dialog options: {error}"))?;
        dialog
            .SetOptions(
                options
                    | FOS_FORCEFILESYSTEM
                    | FOS_FILEMUSTEXIST
                    | FOS_PATHMUSTEXIST
                    | FOS_NOCHANGEDIR,
            )
            .map_err(|error| format!("Failed to configure Windows open dialog: {error}"))?;
        configure_backup_file_dialog(&dialog, title)?;

        if let Err(error) = dialog.Show(None) {
            if error.code() == HRESULT::from_win32(ERROR_CANCELLED.0) {
                return Ok(None);
            }
            return Err(format!("Windows open dialog failed: {error}"));
        }

        let result = dialog
            .GetResult()
            .map_err(|error| format!("Failed to read selected backup file: {error}"))?;
        shell_item_to_path(&result, "selected backup file")
    }
}

#[cfg(target_os = "windows")]
fn configure_backup_file_dialog(dialog: &IFileDialog, title: &str) -> AppResult<()> {
    unsafe {
        let filters = [
            COMDLG_FILTERSPEC {
                pszName: w!("SQLite backup (*.sqlite3)"),
                pszSpec: w!("*.sqlite3"),
            },
            COMDLG_FILTERSPEC {
                pszName: w!("All files (*.*)"),
                pszSpec: w!("*.*"),
            },
        ];
        dialog
            .SetFileTypes(&filters)
            .map_err(|error| format!("Failed to set backup file filters: {error}"))?;
        dialog
            .SetFileTypeIndex(1)
            .map_err(|error| format!("Failed to set backup file filter: {error}"))?;
        let title_wide = str_to_wide_null(title);
        dialog
            .SetTitle(PCWSTR(title_wide.as_ptr()))
            .map_err(|error| format!("Failed to set Windows dialog title: {error}"))?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn pick_windows_folder(
    title: &str,
    initial_directory: Option<&Path>,
) -> AppResult<Option<PathBuf>> {
    let title = title.to_string();
    let initial_directory = initial_directory.map(Path::to_path_buf);
    std::thread::spawn(move || pick_windows_folder_on_sta(&title, initial_directory.as_deref()))
        .join()
        .map_err(|_| "Windows folder dialog thread panicked.".to_string())?
}

#[cfg(target_os = "windows")]
fn pick_windows_folder_on_sta(
    title: &str,
    initial_directory: Option<&Path>,
) -> AppResult<Option<PathBuf>> {
    unsafe {
        let _com_guard = init_windows_dialog_com()?;
        let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)
            .map_err(|error| format!("Failed to create Windows folder dialog: {error}"))?;
        let options = dialog
            .GetOptions()
            .map_err(|error| format!("Failed to read Windows folder dialog options: {error}"))?;
        dialog
            .SetOptions(
                options
                    | FOS_PICKFOLDERS
                    | FOS_FORCEFILESYSTEM
                    | FOS_PATHMUSTEXIST
                    | FOS_NOCHANGEDIR,
            )
            .map_err(|error| format!("Failed to configure Windows folder dialog: {error}"))?;
        let title_wide = str_to_wide_null(title);
        dialog
            .SetTitle(PCWSTR(title_wide.as_ptr()))
            .map_err(|error| format!("Failed to set Windows folder dialog title: {error}"))?;

        if let Some(initial_directory) = initial_directory.filter(|path| path.exists()) {
            let wide_path = path_to_wide_null(initial_directory);
            let shell_item: IShellItem =
                SHCreateItemFromParsingName(PCWSTR(wide_path.as_ptr()), None)
                    .map_err(|error| format!("Failed to open initial folder: {error}"))?;
            dialog
                .SetFolder(&shell_item)
                .map_err(|error| format!("Failed to set initial folder: {error}"))?;
        }

        if let Err(error) = dialog.Show(None) {
            if error.code() == HRESULT::from_win32(ERROR_CANCELLED.0) {
                return Ok(None);
            }
            return Err(format!("Windows folder dialog failed: {error}"));
        }

        let result = dialog
            .GetResult()
            .map_err(|error| format!("Failed to read selected folder: {error}"))?;
        shell_item_to_path(&result, "selected folder")
    }
}

#[cfg(target_os = "windows")]
fn shell_item_to_path(item: &IShellItem, label: &str) -> AppResult<Option<PathBuf>> {
    unsafe {
        let selected_path = item
            .GetDisplayName(SIGDN_FILESYSPATH)
            .map_err(|error| format!("Failed to read {label} path: {error}"))?;
        let selected = pwstr_to_string_and_free(selected_path)
            .map_err(|error| format!("Failed to decode {label} path: {error}"))?;
        Ok(Some(PathBuf::from(selected)))
    }
}

#[cfg(target_os = "windows")]
fn path_to_wide_null(path: &Path) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;

    path.as_os_str().encode_wide().chain(Some(0)).collect()
}

#[cfg(target_os = "windows")]
fn str_to_wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
}

#[cfg(target_os = "windows")]
fn pwstr_to_string_and_free(value: PWSTR) -> Result<String, std::string::FromUtf16Error> {
    unsafe {
        let result = value.to_string();
        CoTaskMemFree(Some(value.as_ptr().cast()));
        result
    }
}
