'use client';

import { profileApi } from '@/lib/services/profile-api';
import { useAuth } from '@/lib/context/AuthContext';
import { ImageCropUploader } from '@/components/shared/ImageCropUploader';

/**
 * Profile-photo crop modal. Thin wrapper over ImageCropUploader (circle) that
 * posts to the profile picture API and updates AuthContext. Used by onboarding
 * (required) and Settings → Profile.
 */

export interface ProfileImageUploaderProps {
  open: boolean;
  onClose?: () => void;
  /** Called with the new Cloudinary URL after a successful upload. */
  onUploaded?: (url: string) => void;
  currentUrl?: string | null;
  /** Required mode (onboarding gate): no close/skip, must upload to proceed. */
  required?: boolean;
  title?: string;
}

export function ProfileImageUploader({
  open,
  onClose,
  onUploaded,
  required = false,
  title,
}: ProfileImageUploaderProps) {
  const { updateUser } = useAuth();

  return (
    <ImageCropUploader
      open={open}
      onClose={onClose}
      required={required}
      shape="circle"
      title={title || 'Add your profile photo'}
      description="PNG or JPG, up to 5 MB. Drag to reposition, slide to zoom."
      successMessage="Profile photo updated"
      saveLabel="Save photo"
      requiredSaveLabel="Save & continue"
      upload={async (blob) => {
        const url = await profileApi.uploadPicture(blob, 'avatar.jpg');
        if (!url) throw new Error('Could not upload your photo');
        updateUser({ profilePictureUrl: url });
        return url;
      }}
      onUploaded={onUploaded}
    />
  );
}
