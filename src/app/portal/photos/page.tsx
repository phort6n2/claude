import { permanentRedirect } from 'next/navigation'

/**
 * "My Website" used to be an editor for the warranty and FAQ text, and
 * /portal/photos an uploader. Both are gone: the site is ours to run, and a
 * done-for-you client changes it by telling us, not by editing it.
 *
 * A REDIRECT RATHER THAN A DELETE, because a shop may have bookmarked either
 * of them, and a 404 inside a product somebody pays for reads as the product
 * being broken. The home screen is where they can see the site and everything
 * else they came for.
 */
export default function RemovedPhotoUploader() {
  permanentRedirect('/portal')
}
