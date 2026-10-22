import os
import subprocess
import sys
import tempfile
import unittest

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "transcribe.py")


def run(*args):
    return subprocess.run([sys.executable, SCRIPT, *args], capture_output=True, text=True)


class InputValidationTests(unittest.TestCase):
    def test_missing_file_exits_2(self):
        result = run(os.path.join(tempfile.gettempdir(), "does-not-exist.m4a"))
        self.assertEqual(result.returncode, 2)
        self.assertIn("file not found", result.stderr)

    def test_silk_is_rejected_with_conversion_hint(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "voice.silk")
            open(path, "wb").close()
            result = run(path)
        self.assertEqual(result.returncode, 2)
        self.assertIn("converted to mp3", result.stderr)

    def test_undecodable_audio_exits_3(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "broken.mp3")
            with open(path, "wb") as handle:
                handle.write(b"not audio")
            result = run(path)
        if "ffmpeg not found" in result.stderr:
            self.skipTest("ffmpeg not on PATH")
        self.assertEqual(result.returncode, 3)
        self.assertIn("ffmpeg failed", result.stderr)


if __name__ == "__main__":
    unittest.main()
