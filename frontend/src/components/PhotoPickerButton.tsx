interface PhotoPickerButtonProps {
  label: string;
  disabled: boolean;
  onPick: (file: File) => void;
}

/**
 * A button-styled file picker for a photo — My Profile (avatar-upload.md §5.1),
 * Community Settings and Create Community (community-photo.md §5.2, §5.3).
 * HEIC is offered where the browser can convert it; the server takes only
 * JPEG, PNG and WebP, which the browser step (`prepareAvatar`) produces.
 */
export function PhotoPickerButton({ label, disabled, onPick }: PhotoPickerButtonProps) {
  return (
    <label
      className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border-[1.5px] border-line px-6 text-sm font-semibold text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
        disabled ? 'pointer-events-none border-dashed opacity-60' : ''
      }`}
    >
      {label}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared, so choosing the same file again still fires.
          event.target.value = '';
          if (file) {
            onPick(file);
          }
        }}
      />
    </label>
  );
}
