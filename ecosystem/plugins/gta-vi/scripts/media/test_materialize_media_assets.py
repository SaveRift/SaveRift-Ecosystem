import io
import unittest
from PIL import Image
from materialize_media_assets import BodyBudget, MAX_IMAGE_BYTES, inspect_image, validated_url


class MaterializerTests(unittest.TestCase):
    @staticmethod
    def sample():
        out=io.BytesIO(); Image.new('RGBA',(8,4),(10,20,30,128)).save(out,format='WEBP',lossless=True)
        return out.getvalue()

    def test_image_identity_is_content_addressed(self):
        data=self.sample(); image=inspect_image(data,(8,4))
        self.assertEqual(image['assetId'],'gta-vi:media:'+image['sha256'])
        self.assertEqual(inspect_image(data,(8,4),image['sha256']),image)

    def test_independent_digest_and_dimensions_required(self):
        data=self.sample()
        with self.assertRaises(ValueError): inspect_image(data,(8,8))
        with self.assertRaises(ValueError): inspect_image(data,(8,4),'0'*64)

    def test_wrong_file_format_rejected(self):
        out=io.BytesIO();Image.new('RGB',(8,4)).save(out,format='PNG')
        with self.assertRaises(ValueError):inspect_image(out.getvalue(),(8,4))

    def test_budget_reserves_concurrent_maximum(self):
        budget=BodyBudget(MAX_IMAGE_BYTES+1)
        ticket=budget.reserve()
        with self.assertRaises(ValueError):budget.reserve()
        budget.finish(ticket,100)
        self.assertEqual(budget.consumed,100)
        self.assertEqual(budget.remaining,budget.limit-100)

    def test_foreign_or_non_webp_url_rejected(self):
        for value in ['https://other.example/media/a.webp','http://negentropy.studio/media/a.webp',
                      'https://negentropy.studio/media/a.glb','https://negentropy.studio/media/a.webp?x=1']:
            with self.subTest(value=value),self.assertRaises(ValueError):validated_url(value)


if __name__=='__main__':unittest.main()
