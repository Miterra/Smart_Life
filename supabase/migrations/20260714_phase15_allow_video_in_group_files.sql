-- Phase 15 — Autoriser les vidéos dans l'espace fichiers des groupes.
--
-- Le bucket "chat-files" n'acceptait que images + PDF (allowed_mime_types) et
-- plafonnait à 25 Mo : toute vidéo était rejetée par le stockage, quoi que
-- fasse le client. On ajoute les formats vidéo courants (mp4, mov/quicktime,
-- webm, mkv, avi, mpeg, 3gp, m4v, ogg) et on porte la limite à 50 Mo — le
-- maximum d'upload du plan free (le client applique la même valeur, cf.
-- MAX_UPLOAD_BYTES dans src/lib/repository.js).
update storage.buckets
set
  file_size_limit = 52428800,
  allowed_mime_types = array[
    'image/png','image/jpeg','image/jpg','image/webp','image/gif','image/heic','image/heif',
    'application/pdf',
    'video/mp4','video/quicktime','video/webm','video/x-matroska','video/x-msvideo',
    'video/mpeg','video/3gpp','video/x-m4v','video/ogg'
  ]
where id = 'chat-files';
