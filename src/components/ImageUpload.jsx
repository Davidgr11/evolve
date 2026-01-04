import { useState, useEffect } from 'react';
import { Upload, X } from 'lucide-react';

const ImageUpload = ({ id, onChange, disabled, accept = "image/*", label = "Select Image", existingImageUrl }) => {
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState(existingImageUrl || null);

  useEffect(() => {
    if (existingImageUrl) {
      setPreview(existingImageUrl);
    }
  }, [existingImageUrl]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);
      };
      reader.readAsDataURL(file);

      if (onChange) onChange(e);
    }
  };

  const handleClear = () => {
    setFileName('');
    setPreview(null);
    const input = document.getElementById(id);
    if (input) input.value = '';
  };

  return (
    <div>
      <label htmlFor={id} className="block">
        <div className={`border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center cursor-pointer hover:border-primary-500 dark:hover:border-primary-400 transition-colors bg-white dark:bg-gray-700 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
          {preview ? (
            <div className="relative">
              <img src={preview} alt="Preview" className="max-h-48 mx-auto rounded" />
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  handleClear();
                }}
                className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white p-1 rounded-full"
                disabled={disabled}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">{label}</p>
              {fileName && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{fileName}</p>}
              {!fileName && <p className="text-xs text-gray-400 dark:text-gray-500">Click to browse or drag and drop</p>}
            </>
          )}
        </div>
      </label>
      <input
        id={id}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />
    </div>
  );
};

export default ImageUpload;
