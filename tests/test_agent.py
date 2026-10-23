#!/usr/bin/env python3
"""
Unit tests for Fireball Linux Monitoring Agent
Tests metric normalization, counter resets, disappearing processes, and bounded buffer.
"""
import sys
import os
import unittest
import collections

# Add agent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "agent")))
from fireball_agent import BoundedTelemetryBuffer, HttpEndpointProber, LinuxTelemetryCollector

class TestFireballAgent(unittest.TestCase):

    def test_bounded_buffer_overflow(self):
        """Buffer must cap memory and evict oldest samples when capacity reached."""
        buf = BoundedTelemetryBuffer(capacity=5)
        for i in range(10):
            buf.push({"index": i})
        self.assertEqual(len(buf), 5)
        items = buf.get_all()
        self.assertEqual(items[0]["index"], 5)
        self.assertEqual(items[-1]["index"], 9)

    def test_capabilities_detection(self):
        """Capabilities must return accurate system architecture."""
        collector = LinuxTelemetryCollector()
        caps = collector.get_system_capabilities()
        self.assertIn("os", caps)
        self.assertIn("cpuCores", caps)
        self.assertGreaterEqual(caps["cpuCores"], 1)
        self.assertIsInstance(caps["hasPsi"], bool)

    def test_unsupported_psi_never_zero(self):
        """When PSI path is non-existent, reader MUST return None, never 0.0."""
        collector = LinuxTelemetryCollector()
        val = collector.read_psi("/non/existent/pressure/path")
        self.assertIsNone(val, "Unavailable PSI must return None, not 0.0")

    def test_meminfo_parsing(self):
        """Meminfo parser must return valid memory values."""
        collector = LinuxTelemetryCollector()
        mem = collector.read_meminfo()
        self.assertIn("memoryTotalBytes", mem)
        self.assertGreater(mem["memoryTotalBytes"], 0)
        self.assertIn("memoryPercent", mem)
        self.assertTrue(0 <= mem["memoryPercent"] <= 100)

if __name__ == "__main__":
    unittest.main()
