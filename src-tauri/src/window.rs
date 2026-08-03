use tauri::{Manager, PhysicalPosition, PhysicalSize};

const INITIAL_WINDOW_WIDTH_RATIO: f64 = 0.69;
const INITIAL_WINDOW_HEIGHT_RATIO: f64 = 0.82;
const INITIAL_WINDOW_MIN_WIDTH: u32 = 980;
const INITIAL_WINDOW_MIN_HEIGHT: u32 = 680;
const INITIAL_WINDOW_MIN_RESTORED_SIZE: u32 = 360;
const INITIAL_WINDOW_EDGE_PADDING: u32 = 32;

pub fn apply_initial_window_bounds(app: &tauri::App) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let Ok(Some(monitor)) = window.primary_monitor() else {
        return;
    };
    let area = monitor.work_area();
    let usable_width = area.size.width.max(1);
    let usable_height = area.size.height.max(1);
    let max_width = INITIAL_WINDOW_MIN_RESTORED_SIZE
        .max(usable_width.saturating_sub(INITIAL_WINDOW_EDGE_PADDING * 2));
    let max_height = INITIAL_WINDOW_MIN_RESTORED_SIZE
        .max(usable_height.saturating_sub(INITIAL_WINDOW_EDGE_PADDING * 2));
    let min_width = INITIAL_WINDOW_MIN_WIDTH.min(max_width);
    let min_height = INITIAL_WINDOW_MIN_HEIGHT.min(max_height);
    let width = clamp_f64(
        usable_width as f64 * INITIAL_WINDOW_WIDTH_RATIO,
        min_width as f64,
        max_width as f64,
    )
    .round() as u32;
    let height = clamp_f64(
        usable_height as f64 * INITIAL_WINDOW_HEIGHT_RATIO,
        min_height as f64,
        max_height as f64,
    )
    .round() as u32;
    let x = area.position.x + (usable_width as i32 - width as i32) / 2;
    let y = area.position.y + (usable_height as i32 - height as i32) / 2;
    let _ = window.set_size(PhysicalSize::new(width, height));
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

pub(crate) fn clamp_f64(value: f64, min: f64, max: f64) -> f64 {
    let upper = min.max(max);
    value.max(min).min(upper)
}
