export function readError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return translateErrorMessage(message);
}

function translateErrorMessage(message: string) {
  const exactMessages: Record<string, string> = {
    "Selected path is not a folder.": "选择的路径不是文件夹。",
    "No Markdown files were found in this folder.": "这个文件夹中没有找到 Markdown 文件。",
    "Book folder no longer exists.": "书籍文件夹不存在或已被移动。",
    "Book root folder is missing.": "书籍根文件夹不存在或已被移动。",
    "Book was not found.": "没有找到这本书。",
    "Book name cannot be empty.": "书籍名称不能为空。",
    "Chapter not found.": "没有找到章节。",
    "Chapter source file no longer exists.": "章节源文件不存在或已被移动。",
    "Current chapter version cannot be deleted. Switch to or create another current version first.":
      "当前章节版本不能删除，请先切换或创建另一个当前版本。",
    "Preset name cannot be empty.": "预设名称不能为空。",
    "Backup path cannot be the active database file.": "备份路径不能是当前正在使用的数据库文件。",
    "Auto backup path must be a folder.": "自动备份路径必须是文件夹。",
    "Database lock is poisoned.": "数据库锁状态异常，请重启应用后再试。",
    "Unknown annotation status.": "未知的批注状态。",
    "Unknown export template.": "未知的导出模板。",
  };
  if (exactMessages[message]) return exactMessages[message];

  const prefixes: Array<[string, string]> = [
    ["Failed to open folder picker:", "打开文件夹选择器失败："],
    ["Folder picker failed:", "文件夹选择器失败："],
    ["Failed to open backup save dialog:", "打开备份保存窗口失败："],
    ["Backup save dialog failed:", "备份保存窗口失败："],
    ["Failed to open backup file dialog:", "打开备份文件窗口失败："],
    ["Backup file dialog failed:", "备份文件窗口失败："],
    ["Failed to open auto backup folder picker:", "打开自动备份文件夹选择器失败："],
    ["Auto backup folder picker failed:", "自动备份文件夹选择器失败："],
    ["Failed to create auto backup folder:", "创建自动备份文件夹失败："],
    ["Failed to replace existing auto backup file:", "替换已有自动备份文件失败："],
    ["Failed to create auto backup:", "创建自动备份失败："],
    ["Failed to resolve folder path:", "解析文件夹路径失败："],
    ["Failed to read book folder:", "读取书籍文件夹失败："],
    ["Failed to read folder entry:", "读取文件夹条目失败："],
    ["Failed to resolve chapter path:", "解析章节路径失败："],
    ["Failed to open folder in Explorer:", "在资源管理器中打开文件夹失败："],
    ["Failed to open chapter in Explorer:", "在资源管理器中打开章节失败："],
    ["Failed to open chapter file:", "打开章节文件失败："],
    ["Failed to open chapter folder:", "打开章节文件夹失败："],
    ["Failed to open folder:", "打开文件夹失败："],
    ["Failed to update pinned state:", "更新置顶状态失败："],
    ["Failed to save chapter order:", "保存章节顺序失败："],
    ["Failed to start chapter deletion:", "启动章节删除失败："],
    ["Failed to delete chapter:", "删除章节失败："],
    ["Failed to save chapter deletion:", "保存章节删除失败："],
    ["Failed to update annotation:", "更新批注失败："],
    ["Failed to update annotation status:", "更新批注状态失败："],
    ["Failed to save annotation status:", "保存批注状态失败："],
    ["Failed to update export preset:", "更新导出预设失败："],
    ["Failed to export backup:", "导出备份失败："],
    ["Failed to open backup database:", "打开备份数据库失败："],
    ["Failed to restore backup:", "恢复备份失败："],
    ["Failed to restore reading progress ratios:", "恢复阅读进度百分比失败："],
    ["Failed to restore annotation anchors:", "恢复批注锚点失败："],
    ["Failed to restore focus mode setting:", "恢复聚焦模式设置失败："],
    ["Failed to restore slide annotation setting:", "恢复划动批注设置失败："],
    ["Failed to restore theme series setting:", "恢复主题系列设置失败："],
    ["Failed to restore pinned books:", "恢复置顶书籍失败："],
    ["Failed to restore pinned annotations:", "恢复置顶批注失败："],
    ["Failed to restore export presets:", "恢复导出预设失败："],
    ["Failed to restore auto backup settings:", "恢复自动备份设置失败："],
    ["Failed to update settings:", "更新设置失败："],
    ["Failed to save reading progress:", "保存阅读进度失败："],
    ["Failed to clear chapter reading progress:", "清除章节阅读进度失败："],
    ["Failed to start import transaction:", "启动导入事务失败："],
    ["Failed to create book:", "创建书籍失败："],
    ["Failed to create chapter:", "创建章节失败："],
    ["Failed to create chapter version:", "创建章节版本失败："],
    ["Failed to finish import:", "完成导入失败："],
    ["Failed to rename book:", "重命名书籍失败："],
    ["Failed to read ", "读取文件失败："],
    ["Failed to update renamed chapter:", "更新改名章节失败："],
    ["Failed to add new chapter:", "添加新章节失败："],
    ["Failed to add new chapter version:", "添加新章节版本失败："],
    ["Failed to start version transaction:", "启动版本事务失败："],
    ["Failed to update current chapter version:", "更新当前章节版本失败："],
    ["Failed to save new chapter version:", "保存新章节版本失败："],
    ["Book not found:", "没有找到书籍："],
    ["Chapter not found:", "没有找到章节："],
    ["Chapter version not found:", "没有找到章节版本："],
    ["Chapter snapshot not found:", "没有找到章节快照："],
    ["Export preset not found:", "没有找到导出预设："],
    ["Annotation not found:", "没有找到批注："],
    ["Database error:", "数据库错误："],
  ];
  for (const [prefix, translatedPrefix] of prefixes) {
    if (message.startsWith(prefix)) {
      return `${translatedPrefix}${message.slice(prefix.length).trimStart()}`;
    }
  }
  return message;
}
