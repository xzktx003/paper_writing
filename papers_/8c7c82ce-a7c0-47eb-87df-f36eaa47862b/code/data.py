"""Data loading utilities for TORQ experiments."""

import torch
from torch.utils.data import DataLoader, Dataset
from transformers import AutoTokenizer


class CalibrationDataset(Dataset):
    """Load calibration data from NeelNanda/pile-10k."""

    def __init__(
        self,
        tokenizer_path: str,
        seq_len: int = 2048,
        num_samples: int = 128,
        dataset_name: str = "NeelNanda/pile-10k",
    ):
        from datasets import load_dataset

        self.seq_len = seq_len
        self.tokenizer = AutoTokenizer.from_pretrained(tokenizer_path, trust_remote_code=True)
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token

        dataset = load_dataset(dataset_name, split="train")
        self.samples = []
        token_buffer = []

        for item in dataset:
            text = item["text"]
            tokens = self.tokenizer.encode(text, add_special_tokens=False)
            token_buffer.extend(tokens)

            while len(token_buffer) >= seq_len and len(self.samples) < num_samples:
                self.samples.append(torch.tensor(token_buffer[:seq_len], dtype=torch.long))
                token_buffer = token_buffer[seq_len:]

            if len(self.samples) >= num_samples:
                break

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        return self.samples[idx]


def get_calibration_dataloader(
    tokenizer_path: str,
    batch_size: int = 8,
    seq_len: int = 2048,
    num_samples: int = 128,
) -> DataLoader:
    dataset = CalibrationDataset(
        tokenizer_path=tokenizer_path,
        seq_len=seq_len,
        num_samples=num_samples,
    )
    return DataLoader(dataset, batch_size=batch_size, shuffle=False)


def get_wikitext2_testdata(tokenizer_path: str, seq_len: int = 2048, max_chunks: int = 20) -> list[torch.Tensor]:
    """Load WikiText2 test set for PPL evaluation."""
    from datasets import load_dataset

    tokenizer = AutoTokenizer.from_pretrained(tokenizer_path, trust_remote_code=True)
    dataset = load_dataset("wikitext", "wikitext-2-raw-v1", split="test")

    text = "\n\n".join(dataset["text"])
    tokens = tokenizer.encode(text, add_special_tokens=False)
    tokens = torch.tensor(tokens, dtype=torch.long)

    # Split into chunks
    chunks = []
    for i in range(0, len(tokens) - seq_len, seq_len):
        chunks.append(tokens[i:i + seq_len])
        if len(chunks) >= max_chunks:
            break

    return chunks
