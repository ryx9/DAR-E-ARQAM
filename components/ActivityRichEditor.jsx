import { useEffect, useRef } from 'react';
import {
  Bold,
  CheckSquare,
  ChevronDown,
  Code2,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  MessageSquareQuote,
  Minus,
  Strikethrough,
  Table2,
  Underline,
} from 'lucide-react';

const toolClass =
  'inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white';

function ToolButton({ label, icon: Icon, onClick }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={toolClass}
      onMouseDown={event => event.preventDefault()}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/** A compact rich-text editor that stores portable HTML in the activity description. */
export default function ActivityRichEditor({ value, onChange, placeholder }) {
  const editorRef = useRef(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== (value || '')) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  const emit = () => onChange(editorRef.current?.innerHTML || '');
  const handleChange = event => {
    if (event.target instanceof HTMLInputElement && event.target.type === 'checkbox') {
      if (event.target.checked) event.target.setAttribute('checked', '');
      else event.target.removeAttribute('checked');
    }
    emit();
  };
  const command = (name, argument = null) => {
    editorRef.current?.focus();
    document.execCommand(name, false, argument);
    emit();
  };

  const setBlock = block => command('formatBlock', block);
  const addTask = () => {
    editorRef.current?.focus();
    document.execCommand(
      'insertHTML',
      false,
      '<div class="activity-task"><input type="checkbox" /> <span>Task item</span></div>'
    );
    emit();
  };
  const addDivider = () => {
    editorRef.current?.focus();
    document.execCommand('insertHTML', false, '<hr /><p><br /></p>');
    emit();
  };
  const addTable = () => {
    const rows = Number(window.prompt('Number of rows (including the heading row)', '3'));
    const columns = Number(window.prompt('Number of columns', '3'));
    if (
      !Number.isInteger(rows) ||
      !Number.isInteger(columns) ||
      rows < 2 ||
      columns < 1 ||
      rows > 20 ||
      columns > 10
    ) {
      window.alert('Choose 2–20 rows and 1–10 columns.');
      return;
    }
    const headings = Array.from(
      { length: columns },
      (_, index) => `<th>Column ${index + 1}</th>`
    ).join('');
    const body = Array.from(
      { length: rows - 1 },
      () => `<tr>${Array.from({ length: columns }, () => '<td>Detail</td>').join('')}</tr>`
    ).join('');
    editorRef.current?.focus();
    document.execCommand(
      'insertHTML',
      false,
      `<table><thead><tr>${headings}</tr></thead><tbody>${body}</tbody></table><p><br /></p>`
    );
    emit();
  };
  const activeTable = () => {
    const node = window.getSelection()?.anchorNode;
    const element = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    return element?.closest?.('table');
  };
  const resizeTable = (axis, direction) => {
    const table = activeTable();
    if (!table) return window.alert('Place the cursor inside the table you want to resize.');
    if (axis === 'row') {
      if (direction < 0) {
        if (table.rows.length <= 2)
          return window.alert('A table needs a heading row and at least one detail row.');
        table.deleteRow(table.rows.length - 1);
      } else {
        const row = table.insertRow(-1);
        const cells = table.rows[0].cells.length;
        for (let index = 0; index < cells; index++) row.insertCell().textContent = 'Detail';
      }
    } else if (direction < 0) {
      if (table.rows[0].cells.length <= 1)
        return window.alert('A table needs at least one column.');
      [...table.rows].forEach(row => row.deleteCell(row.cells.length - 1));
    } else {
      [...table.rows].forEach((row, index) => {
        const cell = row.insertCell(-1);
        if (index === 0) cell.outerHTML = '<th>Column</th>';
        else cell.textContent = 'Detail';
      });
    }
    emit();
  };
  const addLink = () => {
    const url = window.prompt('Paste the link URL');
    if (url) command('createLink', url);
  };

  return (
    <div className="overflow-hidden rounded-md border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/10">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-white px-2 py-1.5 dark:border-white/10 dark:bg-slate-950/30">
        <div className="relative mr-1">
          <select
            aria-label="Block type"
            className="h-8 appearance-none rounded-md bg-transparent py-0 pl-2 pr-7 text-xs font-medium text-slate-600 outline-none hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
            defaultValue="p"
            onChange={event => setBlock(event.target.value)}
          >
            <option value="p">Text</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
            <option value="blockquote">Quote</option>
            <option value="pre">Code</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-1 top-2 h-3.5 w-3.5 text-slate-500" />
        </div>
        <span className="h-5 border-l border-gray-200 dark:border-white/10" />
        <ToolButton label="Bold" icon={Bold} onClick={() => command('bold')} />
        <ToolButton label="Italic" icon={Italic} onClick={() => command('italic')} />
        <ToolButton label="Underline" icon={Underline} onClick={() => command('underline')} />
        <ToolButton
          label="Strikethrough"
          icon={Strikethrough}
          onClick={() => command('strikeThrough')}
        />
        <span className="h-5 border-l border-gray-200 dark:border-white/10" />
        <ToolButton
          label="Bulleted list"
          icon={List}
          onClick={() => command('insertUnorderedList')}
        />
        <ToolButton
          label="Numbered list"
          icon={ListOrdered}
          onClick={() => command('insertOrderedList')}
        />
        <ToolButton label="To-do item" icon={CheckSquare} onClick={addTask} />
        <ToolButton
          label="Quote"
          icon={MessageSquareQuote}
          onClick={() => setBlock('blockquote')}
        />
        <ToolButton label="Code block" icon={Code2} onClick={() => setBlock('pre')} />
        <ToolButton label="Insert table" icon={Table2} onClick={addTable} />
        <button
          type="button"
          title="Add table row"
          className={toolClass}
          onMouseDown={event => event.preventDefault()}
          onClick={() => resizeTable('row', 1)}
        >
          +R
        </button>
        <button
          type="button"
          title="Remove table row"
          className={toolClass}
          onMouseDown={event => event.preventDefault()}
          onClick={() => resizeTable('row', -1)}
        >
          −R
        </button>
        <button
          type="button"
          title="Add table column"
          className={toolClass}
          onMouseDown={event => event.preventDefault()}
          onClick={() => resizeTable('column', 1)}
        >
          +C
        </button>
        <button
          type="button"
          title="Remove table column"
          className={toolClass}
          onMouseDown={event => event.preventDefault()}
          onClick={() => resizeTable('column', -1)}
        >
          −C
        </button>
        <ToolButton label="Divider" icon={Minus} onClick={addDivider} />
        <ToolButton label="Link" icon={Link2} onClick={addLink} />
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emit}
        onChange={handleChange}
        className="activity-rich-editor min-h-[10rem] px-4 py-3 text-sm text-gray-800 outline-none dark:text-slate-200"
      />
    </div>
  );
}
