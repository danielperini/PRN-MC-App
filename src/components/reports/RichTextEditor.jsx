
.rich-text-editor {
  display: flex;
  flex-direction: column;
}

.rich-text-editor .ql-container {
  font-family: inherit;
  font-size: 14px;
  border: 1px solid #e5e7eb;
  border-top: none;
  border-radius: 0 0 6px 6px;
  background-color: white;
  min-height: 120px;
}

.rich-text-editor .ql-container.ql-disabled {
  background-color: #f3f4f6;
  color: #9ca3af;
}

.rich-text-editor .ql-editor {
  padding: 12px;
  min-height: 120px;
  max-height: 300px;
  overflow-y: auto;
}

.rich-text-editor .ql-editor.ql-blank::before {
  color: #d1d5db;
  font-style: normal;
}

.rich-text-editor .ql-toolbar {
  border: 1px solid #e5e7eb;
  border-radius: 6px 6px 0 0;
  background-color: #f9fafb;
}

.rich-text-editor .ql-toolbar.ql-snow .ql-formats {
  margin-right: 15px;
}

.rich-text-editor .ql-toolbar.ql-snow .ql-stroke {
  stroke: #6b7280;
}

.rich-text-editor .ql-toolbar.ql-snow .ql-fill {
  fill: #6b7280;
}

.rich-text-editor .ql-toolbar.ql-snow .ql-picker-label {
  color: #6b7280;
}

.rich-text-editor .ql-toolbar.ql-snow button:hover .ql-stroke,
.rich-text-editor .ql-toolbar.ql-snow button.ql-active .ql-stroke {
  stroke: #000;
}

.rich-text-editor .ql-toolbar.ql-snow button:hover .ql-fill,
.rich-text-editor .ql-toolbar.ql-snow button.ql-active .ql-fill {
  fill: #000;
}

.rich-text-editor .ql-toolbar.ql-snow button:hover .ql-picker-label,
.rich-text-editor .ql-toolbar.ql-snow button.ql-active .ql-picker-label {
  color: #000;
}
