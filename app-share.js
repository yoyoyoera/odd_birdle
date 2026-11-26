// Shares the full-time card from the phone app: the card is written as a PNG into the app's cache folder and handed to
// the system share sheet (Messages, Photos "Save Image", Reddit and so on). In a browser preview it is downloaded.
// Capacitor's plugins are reached as window.Capacitor.Plugins (no bundler), and every call is guarded.
export async function shareCardImage({ canvas, text, fileName = 'oddbirdle-card.png', plugins = globalThis.Capacitor?.Plugins, doc = globalThis.document } = {}) {
  const base64 = canvas.toDataURL('image/png').split(',')[1];
  const { Filesystem, Share } = plugins ?? {};
  if (Filesystem && Share) {
    try {
      const path = fileName.replace(/\.png$/, '') + '-' + Date.now() + '.png';
      const { uri } = await Filesystem.writeFile({ path, data: base64, directory: 'CACHE' });
      await Share.share({ title: 'Odd Birdle', text, files: [uri], dialogTitle: 'Share your card' });
      return 'shared';
    } catch (error) {
      // Closing the share sheet without choosing anything is not a failure.
      if (/cancel/i.test(String(error?.message ?? error))) return 'cancelled';
    }
  }
  try {
    const link = doc.createElement('a');
    link.href = 'data:image/png;base64,' + base64;
    link.download = fileName;
    doc.body.append(link);
    link.click();
    link.remove();
    return 'saved';
  } catch {
    return 'failed';
  }
}
