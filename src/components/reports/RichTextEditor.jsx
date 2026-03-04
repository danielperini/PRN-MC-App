import React, { useState, useEffect, useRef } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

export default function RichTextEditor({ value, onChange, placeholder, disabled }) {
  const [localValue, setLocalValue] = useState(value || '');
  const quillRef = useRef(null);
  const isUpdatingRef = useRef(false);

  useEffect(() => {
    if (!isUpdatingRef.current) {
      setLocalValue(value || '');
    }
  }, [value]);

  const handleChange = (content) => {
    isUpdatingRef.current = true;
    setLocalValue(content);
    onChange(content);
    isUpdatingRef.current = false;
  };

  const modules = {
    toolbar: [
      ['bold', 'italic', 'underline'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['clean']
    ]
  };

  const formats = ['bold', 'italic', 'underline', 'list', 'bullet'];

  return (
    <div className="rich-text-editor">
      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        modules={modules}
        formats={formats}
        readOnly={disabled}
      />
    </div>
  );
}