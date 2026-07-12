use crate::domain::ExportRow;
use crate::utils::now;

pub fn render_export(template_id: &str, task_goal: Option<&str>, rows: &[ExportRow]) -> String {
    let mut out = String::new();
    out.push_str(&format!("# Loop Book Export\n\nGenerated at: {}\n\n", now()));
    if let Some(goal) = task_goal.and_then(normalize_task_goal) {
        out.push_str("## AI System Instruction\n\n");
        out.push_str(ai_system_instruction(goal));
        out.push_str("\n\n");
        out.push_str("## Task Goal\n\n");
        out.push_str(task_goal_label(goal));
        out.push_str("\n\n");
    }

    if rows.is_empty() {
        out.push_str("_No annotations found for this scope._\n");
        return out;
    }

    match template_id {
        "ai-pack" => {
            out.push_str("## AI Revision Packet\n\n");
            for row in rows {
                push_annotation_header(&mut out, row);
                out.push_str("### Original Selection\n\n");
                out.push_str("> ");
                out.push_str(&row.annotation.selected_text.replace('\n', "\n> "));
                out.push_str("\n\n### Context\n\n");
                out.push_str("```text\n");
                out.push_str(&format!(
                    "{}{}{}\n",
                    row.annotation.context_before,
                    row.annotation.selected_text,
                    row.annotation.context_after
                ));
                out.push_str("```\n\n### Reader Comment\n\n");
                out.push_str(empty_marker(&row.annotation.comment));
                out.push_str("\n\n### Suggested AI Task\n\n");
                out.push_str("Revise the selected passage using the reader comment while preserving the chapter's voice and structure.\n\n");
            }
        }
        "question-list" => {
            out.push_str("## Question List\n\n");
            for row in rows {
                out.push_str(&format!(
                    "- **{}** / {}: {}\n",
                    row.chapter_title,
                    fallback_heading(&row.annotation.heading_path),
                    empty_marker(&row.annotation.comment)
                ));
            }
        }
        "annotation-index" => {
            out.push_str("## Full Annotation Index\n\n");
            for row in rows {
                push_annotation_header(&mut out, row);
                out.push_str(&format!(
                    "- Range: `{}..{}`\n- Color: `{}`\n- Tags: `{}`\n\n",
                    row.annotation.start_offset,
                    row.annotation.end_offset,
                    row.annotation.highlight_color,
                    empty_marker(&row.annotation.tags)
                ));
                out.push_str(&format!(
                    "> {}\n\n{}\n\n",
                    row.annotation.selected_text.replace('\n', "\n> "),
                    empty_marker(&row.annotation.comment)
                ));
            }
        }
        _ => {
            out.push_str("## Reading Notes\n\n");
            for row in rows {
                push_annotation_header(&mut out, row);
                out.push_str(&format!(
                    "> {}\n\n{}\n\n",
                    row.annotation.selected_text.replace('\n', "\n> "),
                    empty_marker(&row.annotation.comment)
                ));
            }
        }
    }

    out
}

fn normalize_task_goal(goal: &str) -> Option<&str> {
    match goal {
        "polish" | "rewrite" | "expand" | "questions" | "creative" => Some(goal),
        _ => None,
    }
}

fn task_goal_label(goal: &str) -> &str {
    match goal {
        "polish" => "Polish this chapter",
        "rewrite" => "Rewrite according to annotations",
        "expand" => "Expand selected passages",
        "questions" => "Generate a question list",
        "creative" => "Create a derivative writing brief",
        _ => "General revision",
    }
}

fn ai_system_instruction(goal: &str) -> &'static str {
    match goal {
        "polish" => "You will receive Markdown reading annotations from Loop Book. Polish the relevant chapter text according to the comments while preserving the author's structure, terminology, and intent. Do not invent facts.",
        "rewrite" => "You will receive Markdown reading annotations from Loop Book. Rewrite the chapter sections referenced by the annotations. Treat reader comments as requirements, keep useful original ideas, and explain any major structural changes.",
        "expand" => "You will receive Markdown reading annotations from Loop Book. Expand only the passages that need elaboration. Add examples, transitions, or clarifications where comments ask for them, and avoid changing unrelated passages.",
        "questions" => "You will receive Markdown reading annotations from Loop Book. Convert comments and highlighted passages into a clear issue list and follow-up questions for revision. Group related concerns when possible.",
        "creative" => "You will receive Markdown reading annotations from Loop Book. Use the highlighted passages and comments as source constraints for a derivative writing brief. Preserve the core ideas while making the output ready for a new creative draft.",
        _ => "You will receive Markdown reading annotations from Loop Book. Use the selected text, context, and comments as grounded instructions. Keep version boundaries intact and avoid mixing unrelated chapters.",
    }
}

fn push_annotation_header(out: &mut String, row: &ExportRow) {
    out.push_str(&format!(
        "## {}. {}\n\n",
        row.chapter_sort_index + 1,
        row.chapter_title
    ));
    if !row.annotation.heading_path.trim().is_empty() {
        out.push_str(&format!("Path: `{}`\n\n", row.annotation.heading_path));
    }
}

fn fallback_heading(heading_path: &str) -> &str {
    if heading_path.trim().is_empty() {
        "No heading"
    } else {
        heading_path
    }
}

fn empty_marker(value: &str) -> &str {
    if value.trim().is_empty() {
        "_Empty_"
    } else {
        value
    }
}
