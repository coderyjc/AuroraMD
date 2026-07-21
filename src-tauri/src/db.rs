use rusqlite::Connection;
use std::path::Path;

pub fn init_database(db_path: &Path) -> Result<Connection, rusqlite::Error> {
    let conn = Connection::open(db_path)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS books (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            root_path TEXT NOT NULL UNIQUE,
            view_mode TEXT NOT NULL DEFAULT 'grid',
            is_pinned INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_opened_at TEXT
        );

        CREATE TABLE IF NOT EXISTS chapters (
            id TEXT PRIMARY KEY,
            book_id TEXT NOT NULL,
            file_path TEXT NOT NULL,
            title TEXT NOT NULL,
            sort_index INTEGER NOT NULL,
            current_version_id TEXT NOT NULL,
            is_missing INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(book_id, file_path),
            FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS chapter_versions (
            id TEXT PRIMARY KEY,
            chapter_id TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            version_number INTEGER NOT NULL DEFAULT 1,
            content_snapshot TEXT NOT NULL,
            label TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS annotations (
            id TEXT PRIMARY KEY,
            book_id TEXT NOT NULL,
            chapter_id TEXT NOT NULL,
            chapter_version_id TEXT NOT NULL,
            selected_text TEXT NOT NULL,
            start_offset INTEGER NOT NULL,
            end_offset INTEGER NOT NULL,
            rendered_start_offset INTEGER,
            rendered_end_offset INTEGER,
            context_before TEXT NOT NULL,
            context_after TEXT NOT NULL,
            heading_path TEXT NOT NULL,
            highlight_color TEXT NOT NULL,
            comment TEXT NOT NULL,
            tags TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            is_pinned INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE,
            FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
            FOREIGN KEY(chapter_version_id) REFERENCES chapter_versions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS reading_progress (
            book_id TEXT NOT NULL,
            chapter_id TEXT NOT NULL,
            chapter_version_id TEXT NOT NULL,
            scroll_top REAL NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY(book_id, chapter_id, chapter_version_id),
            FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE,
            FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
            FOREIGN KEY(chapter_version_id) REFERENCES chapter_versions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            annotation_context_chars INTEGER NOT NULL,
            theme_series TEXT NOT NULL DEFAULT 'classic',
            theme TEXT NOT NULL,
            font_family TEXT NOT NULL,
            interface_font_family TEXT NOT NULL DEFAULT '"IBM Plex Sans", "Segoe UI", "Microsoft YaHei", sans-serif',
            interface_latin_font_family TEXT NOT NULL DEFAULT '"IBM Plex Sans", "Segoe UI", sans-serif',
            interface_cjk_font_family TEXT NOT NULL DEFAULT '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif',
            reader_font_family TEXT NOT NULL DEFAULT 'Literata, Georgia, serif',
            reader_latin_font_family TEXT NOT NULL DEFAULT 'Literata, Georgia, serif',
            reader_cjk_font_family TEXT NOT NULL DEFAULT '"Noto Serif SC", "Songti SC", SimSun, serif',
            font_size INTEGER NOT NULL,
            line_height REAL NOT NULL,
            content_width INTEGER NOT NULL,
            page_padding INTEGER NOT NULL,
            paragraph_spacing INTEGER NOT NULL,
            surface TEXT NOT NULL,
            border_style TEXT NOT NULL,
            focus_mode INTEGER NOT NULL DEFAULT 0,
            slide_annotate INTEGER NOT NULL DEFAULT 0,
            home_default_view TEXT NOT NULL DEFAULT 'grid',
            home_table_columns TEXT NOT NULL DEFAULT '{"rowNumber":true,"chapterCount":true,"annotationCount":true,"createdAt":true,"lastOpenedAt":true}',
            home_page_size INTEGER NOT NULL DEFAULT 20,
            shortcut_bindings TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS export_presets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            base_template_id TEXT NOT NULL,
            system_prompt TEXT NOT NULL,
            task_prompt TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        "#,
    )?;

    ensure_column(
        &conn,
        "books",
        "is_pinned",
        "ALTER TABLE books ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(
        &conn,
        "books",
        "last_opened_at",
        "ALTER TABLE books ADD COLUMN last_opened_at TEXT",
    )?;
    ensure_column(
        &conn,
        "chapters",
        "is_missing",
        "ALTER TABLE chapters ADD COLUMN is_missing INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(
        &conn,
        "chapter_versions",
        "version_number",
        "ALTER TABLE chapter_versions ADD COLUMN version_number INTEGER NOT NULL DEFAULT 1",
    )?;
    ensure_column(
        &conn,
        "chapter_versions",
        "label",
        "ALTER TABLE chapter_versions ADD COLUMN label TEXT NOT NULL DEFAULT ''",
    )?;
    ensure_column(
        &conn,
        "annotations",
        "status",
        "ALTER TABLE annotations ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'",
    )?;
    ensure_column(
        &conn,
        "annotations",
        "rendered_start_offset",
        "ALTER TABLE annotations ADD COLUMN rendered_start_offset INTEGER",
    )?;
    ensure_column(
        &conn,
        "annotations",
        "rendered_end_offset",
        "ALTER TABLE annotations ADD COLUMN rendered_end_offset INTEGER",
    )?;
    ensure_column(
        &conn,
        "annotations",
        "is_pinned",
        "ALTER TABLE annotations ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(
        &conn,
        "settings",
        "theme_series",
        "ALTER TABLE settings ADD COLUMN theme_series TEXT NOT NULL DEFAULT 'classic'",
    )?;
    ensure_column(
        &conn,
        "settings",
        "focus_mode",
        "ALTER TABLE settings ADD COLUMN focus_mode INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(
        &conn,
        "settings",
        "slide_annotate",
        "ALTER TABLE settings ADD COLUMN slide_annotate INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(
        &conn,
        "settings",
        "home_default_view",
        "ALTER TABLE settings ADD COLUMN home_default_view TEXT NOT NULL DEFAULT 'grid'",
    )?;
    ensure_column(
        &conn,
        "settings",
        "home_table_columns",
        "ALTER TABLE settings ADD COLUMN home_table_columns TEXT NOT NULL DEFAULT '{\"rowNumber\":true,\"chapterCount\":true,\"annotationCount\":true,\"createdAt\":true,\"lastOpenedAt\":true}'",
    )?;
    ensure_column(
        &conn,
        "settings",
        "home_page_size",
        "ALTER TABLE settings ADD COLUMN home_page_size INTEGER NOT NULL DEFAULT 20",
    )?;
    ensure_column(
        &conn,
        "settings",
        "shortcut_bindings",
        "ALTER TABLE settings ADD COLUMN shortcut_bindings TEXT NOT NULL DEFAULT '{\"search\":\"Ctrl+K\",\"nextChapter\":\"N\",\"previousChapter\":\"P\",\"highlight\":\"H\",\"export\":\"E\",\"toggleLeft\":\"[\",\"toggleRight\":\"]\"}'",
    )?;
    ensure_column(
        &conn,
        "settings",
        "interface_font_family",
        "ALTER TABLE settings ADD COLUMN interface_font_family TEXT NOT NULL DEFAULT '\"IBM Plex Sans\", \"Segoe UI\", \"Microsoft YaHei\", sans-serif'",
    )?;
    ensure_column(
        &conn,
        "settings",
        "interface_latin_font_family",
        "ALTER TABLE settings ADD COLUMN interface_latin_font_family TEXT NOT NULL DEFAULT '\"IBM Plex Sans\", \"Segoe UI\", sans-serif'",
    )?;
    ensure_column(
        &conn,
        "settings",
        "interface_cjk_font_family",
        "ALTER TABLE settings ADD COLUMN interface_cjk_font_family TEXT NOT NULL DEFAULT '\"Microsoft YaHei\", \"PingFang SC\", \"Noto Sans CJK SC\", sans-serif'",
    )?;
    ensure_column(
        &conn,
        "settings",
        "reader_font_family",
        "ALTER TABLE settings ADD COLUMN reader_font_family TEXT NOT NULL DEFAULT 'Literata, Georgia, serif'",
    )?;
    ensure_column(
        &conn,
        "settings",
        "reader_latin_font_family",
        "ALTER TABLE settings ADD COLUMN reader_latin_font_family TEXT NOT NULL DEFAULT 'Literata, Georgia, serif'",
    )?;
    ensure_column(
        &conn,
        "settings",
        "reader_cjk_font_family",
        "ALTER TABLE settings ADD COLUMN reader_cjk_font_family TEXT NOT NULL DEFAULT '\"Noto Serif SC\", \"Songti SC\", SimSun, serif'",
    )?;
    conn.execute_batch(
        r#"
        UPDATE settings
        SET reader_font_family = font_family
        WHERE TRIM(font_family) <> ''
          AND (
            reader_font_family = 'Literata, Georgia, serif'
            OR TRIM(reader_font_family) = ''
          );
        "#,
    )?;
    conn.execute_batch(
        r#"
        UPDATE settings
        SET interface_latin_font_family = interface_font_family
        WHERE TRIM(interface_font_family) <> ''
          AND (
            interface_latin_font_family = '"IBM Plex Sans", "Segoe UI", sans-serif'
            OR TRIM(interface_latin_font_family) = ''
          );

        UPDATE settings
        SET reader_latin_font_family = reader_font_family
        WHERE TRIM(reader_font_family) <> ''
          AND (
            reader_latin_font_family = 'Literata, Georgia, serif'
            OR TRIM(reader_latin_font_family) = ''
          );
        "#,
    )?;
    conn.execute_batch(
        r#"
        UPDATE chapter_versions
        SET version_number = (
            SELECT COUNT(*)
            FROM chapter_versions older
            WHERE older.chapter_id = chapter_versions.chapter_id
              AND (
                older.created_at < chapter_versions.created_at
                OR (older.created_at = chapter_versions.created_at AND older.id <= chapter_versions.id)
              )
        );
        "#,
    )?;

    conn.execute(
        r#"
        INSERT OR IGNORE INTO settings (
            id,
            annotation_context_chars,
            theme_series,
            theme,
            font_family,
            interface_font_family,
            interface_latin_font_family,
            interface_cjk_font_family,
            reader_font_family,
            reader_latin_font_family,
            reader_cjk_font_family,
            font_size,
            line_height,
            content_width,
            page_padding,
            paragraph_spacing,
            surface,
            border_style,
            focus_mode,
            slide_annotate,
            home_default_view,
            home_table_columns,
            home_page_size,
            shortcut_bindings
        ) VALUES (1, 100, 'classic', 'paper', 'Literata, Georgia, serif', '"IBM Plex Sans", "Segoe UI", "Microsoft YaHei", sans-serif', '"IBM Plex Sans", "Segoe UI", sans-serif', '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif', 'Literata, Georgia, serif', 'Literata, Georgia, serif', '"Noto Serif SC", "Songti SC", SimSun, serif', 18, 1.72, 820, 52, 18, 'warm', 'hairline', 0, 0, 'grid', '{"rowNumber":true,"chapterCount":true,"annotationCount":true,"createdAt":true,"lastOpenedAt":true}', 20, '{"search":"Ctrl+K","nextChapter":"N","previousChapter":"P","highlight":"H","export":"E","toggleLeft":"[","toggleRight":"]"}')
        "#,
        [],
    )?;

    Ok(conn)
}

fn ensure_column(
    conn: &Connection,
    table: &str,
    column: &str,
    alter_sql: &str,
) -> Result<(), rusqlite::Error> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name == column {
            return Ok(());
        }
    }
    conn.execute(alter_sql, [])?;
    Ok(())
}
