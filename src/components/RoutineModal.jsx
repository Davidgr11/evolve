import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useAuth } from '../contexts/AuthContext';
import { storage } from '../utils/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import toast from 'react-hot-toast';
import { X, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import ImageUpload from './ImageUpload';

const RoutineModal = ({ routine, onClose, onSave }) => {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [expandedExercise, setExpandedExercise] = useState(0);
  const [pendingImages, setPendingImages] = useState({});
  const { register, control, handleSubmit, formState: { errors } } = useForm({
    defaultValues: routine || {
      name: '',
      type: 'workout',
      series: 1,
      exercises: [{ name: '', repetitions: '', imageUrl: '', imagePath: '' }]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'exercises'
  });

  const toggleExercise = (index) => {
    setExpandedExercise(expandedExercise === index ? -1 : index);
  };

  const handleImageSelect = (index, file) => {
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPendingImages(prev => ({
          ...prev,
          [index]: { preview: reader.result, file }
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageUpload = async (file, exerciseIndex) => {
    if (!file) return null;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be less than 2MB');
      return null;
    }

    try {
      setUploading(true);

      // Compress image
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1024,
        useWebWorker: true
      };
      const compressedFile = await imageCompression(file, options);

      // Upload to Firebase Storage
      const timestamp = Date.now();
      const imagePath = `users/${user.uid}/exercises/${timestamp}_${file.name}`;
      const storageRef = ref(storage, imagePath);
      await uploadBytes(storageRef, compressedFile);
      const imageUrl = await getDownloadURL(storageRef);

      return { imageUrl, imagePath };
    } catch (error) {
      toast.error('Failed to upload image');
      console.error(error);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (data) => {
    // Process each exercise to upload images
    const processedExercises = await Promise.all(
      data.exercises.map(async (exercise, index) => {
        // Check if there's a pending image for this exercise
        const pendingImage = pendingImages[index];

        if (pendingImage?.file) {
          const uploadResult = await handleImageUpload(pendingImage.file, index);
          return {
            ...exercise,
            imageUrl: uploadResult?.imageUrl || exercise.imageUrl || '',
            imagePath: uploadResult?.imagePath || exercise.imagePath || ''
          };
        }

        return exercise;
      })
    );

    onSave({
      ...data,
      exercises: processedExercises
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-2xl my-8 border border-transparent dark:border-gray-700">
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {routine ? 'Edit Routine' : 'Create Routine'}
          </h2>
          <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 max-h-[70vh] overflow-y-auto">
          <div className="space-y-4">
            {/* Routine Name */}
            <div>
              <label className="label">Routine Name *</label>
              <input
                type="text"
                className="input-field"
                {...register('name', { required: 'Name is required' })}
              />
              {errors.name && (
                <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
              )}
            </div>

            {/* Type */}
            <div>
              <label className="label">Type *</label>
              <select className="input-field" {...register('type', { required: true })}>
                <option value="stretch">Stretch</option>
                <option value="workout">Workout</option>
                <option value="running">Running</option>
                <option value="sports">Sports</option>
              </select>
            </div>

            {/* Series */}
            <div>
              <label className="label">Series *</label>
              <input
                type="number"
                min="1"
                className="input-field"
                {...register('series', {
                  required: 'Series is required',
                  min: { value: 1, message: 'Minimum 1 series' }
                })}
              />
              {errors.series && (
                <p className="text-red-500 text-sm mt-1">{errors.series.message}</p>
              )}
            </div>

            {/* Exercises */}
            <div>
              <label className="label mb-3">Exercises</label>

              {fields.map((field, index) => (
                <div key={field.id} className="border border-gray-200 dark:border-gray-600 rounded-lg mb-3 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleExercise(index)}
                    className="w-full flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                  >
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">
                      Exercise {index + 1}{field.name && `: ${field.name}`}
                    </h4>
                    <div className="flex items-center gap-2">
                      {fields.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            remove(index);
                            if (expandedExercise === index) {
                              setExpandedExercise(0);
                            }
                          }}
                          className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      {expandedExercise === index ? (
                        <ChevronUp className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                      )}
                    </div>
                  </button>

                  {expandedExercise === index && (
                    <div className="p-4 space-y-3 bg-white dark:bg-gray-800">
                      <div>
                        <label className="label">Exercise Name *</label>
                        <input
                          type="text"
                          className="input-field"
                          {...register(`exercises.${index}.name`, {
                            required: 'Exercise name is required'
                          })}
                        />
                        {errors.exercises?.[index]?.name && (
                          <p className="text-red-500 text-sm mt-1">
                            {errors.exercises[index].name.message}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="label">Repetitions (optional)</label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="e.g., 10 reps or 30 seconds"
                          {...register(`exercises.${index}.repetitions`)}
                        />
                      </div>

                      <div>
                        <label className="label">Image (optional, max 2MB)</label>
                        <ImageUpload
                          id={`exercise-image-${index}`}
                          label="Upload exercise image"
                          existingImageUrl={pendingImages[index]?.preview || field.imageUrl}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImageSelect(index, file);
                          }}
                        />
                        <input type="hidden" {...register(`exercises.${index}.imageUrl`)} />
                        <input type="hidden" {...register(`exercises.${index}.imagePath`)} />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={() => {
                  append({ name: '', repetitions: '', imageUrl: '', imagePath: '' });
                  setExpandedExercise(fields.length);
                }}
                className="w-full mt-3 py-3 px-4 border-2 border-dashed border-primary-300 dark:border-primary-600 text-primary-600 dark:text-primary-400 hover:border-primary-400 dark:hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors flex items-center justify-center gap-2 font-medium"
              >
                <Plus className="w-5 h-5" />
                Add Exercise
              </button>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="btn-primary flex-1"
            >
              {uploading ? 'Uploading...' : 'Save Routine'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RoutineModal;
