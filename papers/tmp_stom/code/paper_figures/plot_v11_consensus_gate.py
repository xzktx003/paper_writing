from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "img"
OUTPUT.mkdir(parents=True, exist_ok=True)

aggregate = 98.19725239848194
consensus = 48.710067327101636
accepted = 0.0

baseline_macro = 76.328125
v10_rates = np.array([0.9635367, 1.9270734, 3.8541469, 7.7082930,
                      1.7708135, 3.5416271, 7.0832535, 14.1665069])
v10_macro = np.array([67.65625, 68.046875, 70.859375, 67.109375,
                      68.125, 68.671875, 71.40625, 71.640625])
v11_rates = np.array([0.6980329, 1.3960652, 2.7921296, 5.5842593,
                      1.0125869, 2.0251731, 4.0503455, 8.1006903])
v11_macro = np.array([65.625, 67.65625, 69.609375, 68.59375,
                      64.296875, 66.40625, 71.328125, 73.90625])

plt.rcParams.update({
    "font.size": 10,
    "axes.titlesize": 11,
    "axes.labelsize": 10,
    "legend.fontsize": 8.5,
})
fig, axes = plt.subplots(1, 2, figsize=(9.2, 3.45), constrained_layout=True)

ax = axes[0]
bars = ax.bar(
    ["Aggregate\nnegative", "4-view strict\nconsensus", "Accepted\nhard state"],
    [aggregate, consensus, accepted],
    color=["#9aa6b2", "#2878b5", "#d9534f"],
    width=0.67,
)
for bar, value in zip(bars, [aggregate, consensus, accepted]):
    ax.text(bar.get_x() + bar.get_width() / 2, value + 2.0,
            f"{value:.2f}%", ha="center", va="bottom", fontweight="bold")
ax.set_ylim(0, 108)
ax.set_ylabel("Fraction of 145.5M vectors (%)")
ax.set_title("Consensus filters conflict, not curvature")
ax.grid(axis="y", alpha=0.22)

ax = axes[1]
ax.axhline(baseline_macro, color="#222222", linestyle="--", linewidth=1.4,
           label="Frozen-scale baseline")
ax.scatter(v10_rates, v10_macro, marker="x", s=45, linewidth=1.7,
           color="#9aa6b2", label="V10 aggregate proposal")
ax.plot(v11_rates[:4], v11_macro[:4], "o-", color="#e07a1f", linewidth=1.4,
        markersize=4.5, label="V11 epoch 1")
ax.plot(v11_rates[4:], v11_macro[4:], "o-", color="#2878b5", linewidth=1.4,
        markersize=4.5, label="V11 epoch 2")
ax.fill_between([0, 5], 60, 80, color="#3a9d5d", alpha=0.06,
                label="Pre-registered rate region")
ax.set_xlim(0, 15)
ax.set_ylim(63, 78)
ax.set_xlabel("Hard assignment switch rate (%)")
ax.set_ylabel("Validation Macro (%)")
ax.set_title("All eight consensus hard sets remain below source")
ax.grid(alpha=0.22)
ax.legend(loc="lower right", frameon=True)

for suffix in ("png", "pdf"):
    fig.savefig(OUTPUT / f"v11_consensus_gate.{suffix}", dpi=240,
                bbox_inches="tight")
plt.close(fig)
