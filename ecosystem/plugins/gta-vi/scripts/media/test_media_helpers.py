import unittest
from media_helpers import exact_image_matches, media_url, model_matches, preview_ref


class MediaEvidenceTests(unittest.TestCase):
    def test_only_same_origin_root_relative_media(self):
        self.assertEqual(media_url('/media/example.webp'), 'https://negentropy.studio/media/example.webp')
        for path in ['https://other.example/media/a.webp', '//other.example/media/a.webp',
                     '/media/../private', '/media/%2e%2e/private', '/media/a.webp?token=x',
                     '/media/a.webp#fragment', '/media/\\private']:
            with self.subTest(path=path), self.assertRaises(ValueError): media_url(path)

    def test_three_and_five_field_descriptors_are_images(self):
        row = ['a', 'A', 'TOKEN', 'category', [], ['/media/a.webp', 256, 128]]
        self.assertEqual(preview_ref(row, '/e/2')['width'], 256)
        row[5] += ['/media/a-sm.webp', 128]
        self.assertEqual(preview_ref(row, '/e/2')['thumbnail']['width'], 128)

    def test_missing_images_stay_missing(self):
        for row in [['a'] * 5, ['a'] * 5 + [None], ['a'] * 5 + [0]]:
            self.assertIsNone(preview_ref(row, '/e/0'))

    def test_invalid_dimensions_rejected(self):
        for dims in [[0, 1], [True, 256], [64, -1]]:
            with self.assertRaises(ValueError): preview_ref(['a'] * 5 + [['/media/a.webp', *dims]], '/e/0')

    @staticmethod
    def image(source, name='a', pixels='p', width=32, file_hash='f'):
        return {'source': source, 'recordId': name, 'status': 'ok', 'width': width,
                'height': 32, 'pixelSha256': pixels, 'sha256': file_hash}

    def test_exact_bytes_and_pixels_distinguished(self):
        a = self.image('vehicles'); b = self.image('images')
        self.assertEqual(exact_image_matches([a,b])[0][0][2], 'identical-webp-bytes')
        b['sha256'] = 'other'
        self.assertEqual(exact_image_matches([a,b])[0][0][2], 'identical-decoded-rgba')

    def test_duplicate_gallery_match_is_not_promoted(self):
        a = self.image('vehicles'); b = self.image('images'); c = self.image('images','b')
        matches, ambiguous, _ = exact_image_matches([a,b,c])
        self.assertEqual(matches, []); self.assertEqual(len(ambiguous), 1)

    def test_dimensions_are_part_of_identity(self):
        a = self.image('vehicles'); b = self.image('images',width=16)
        self.assertEqual(len(exact_image_matches([a,b])[2]), 1)

    def test_failed_fetch_never_links(self):
        a = self.image('vehicles'); b = self.image('images'); b['status']='failed'
        self.assertEqual(exact_image_matches([a,b])[0], [])

    def test_model_token_not_fuzzy_name(self):
        models=[['car', 'Car', 'car_hi', 'Vehicle', []]]
        rows=[['item', 'Car', 'car', 'Vehicle', []]]
        self.assertEqual(model_matches(rows,models)[0]['status'],'unmatched')

    def test_model_preview_match_preserves_shared_art(self):
        image=['/media/car.webp',32,32]
        models=[['model', 'Model', 'model_token', 'Vehicle', [], image]]
        rows=[['a', 'A', 'other', 'Vehicle', [], image], ['b','B','different','Vehicle',[],image]]
        linked=model_matches(rows,models)
        self.assertEqual([x['method'] for x in linked],['exact-preview-image-url']*2)
        self.assertEqual([x['status'] for x in linked],['unique']*2)

    def test_duplicate_model_token_is_ambiguous(self):
        rows=[['a','A','x','Vehicle',[]]]
        models=[['a','A','x','Vehicle',[]],['b','B','x','Vehicle',[]]]
        self.assertEqual(model_matches(rows,models)[0]['status'],'ambiguous')


if __name__=='__main__': unittest.main()
