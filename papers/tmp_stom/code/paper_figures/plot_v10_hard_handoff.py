"""Generate the V10 hard-handoff endpoint and projection-path figure."""

from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt


ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PDF = ROOT / "img" / "v10_hard_handoff.pdf"
OUTPUT_PNG = ROOT / "img" / "v10_hard_handoff.png"


def main() -> None:
    plt.rcParams.update(
        {
            "font.family": "DejaVu Sans",
            "font.size": 9,
            "axes.labelsize": 9,
            "axes.titlesize": 10,
            "legend.fontsize": 7.2,
            "pdf.fonttype": 42,
            "ps.fonttype": 42,
        }
    )

    fig, (ax_end, ax_path) = plt.subplots(1, 2, figsize=(7.2, 2.8))

    endpoints = {
        "QTIP (general PTQ)": (8.7971146626, 69.84693128, "D", "#3B6FB6"),
        "Vector-GSQ anchor": (10.4959764481, 67.99970386, "o", "#646464"),
        "Assignment-only": (10.7346715927, 69.47737347, "o", "#E08B24"),
        "Scale-only": (10.9447565079, 71.72225110, "o", "#2C8C6B"),
        "Naive joint": (11.4097919464, 69.74338550, "X", "#C9485B"),
    }
    offsets = {
        "QTIP (general PTQ)": (5, 6),
        "Vector-GSQ anchor": (5, -13),
        "Assignment-only": (-55, 7),
        "Scale-only": (-25, 7),
        "Naive joint": (5, 6),
    }
    for name, (ppl, macro, marker, color) in endpoints.items():
        ax_end.scatter(
            ppl,
            macro,
            s=58,
            marker=marker,
            color=color,
            edgecolor="white",
            linewidth=0.7,
            zorder=3,
        )
        ax_end.annotate(
            name,
            (ppl, macro),
            xytext=offsets[name],
            textcoords="offset points",
            fontsize=7.2,
            color=color,
        )

    scale_ppl, scale_macro = endpoints["Scale-only"][:2]
    ax_end.scatter(
        scale_ppl,
        scale_macro,
        s=145,
        marker="o",
        facecolors="none",
        edgecolors="#111111",
        linewidth=1.1,
        zorder=2,
        label="hard handoff returns exact scale state",
    )
    ax_end.set_xlabel("WikiText2 perplexity (lower is better)")
    ax_end.set_ylabel("6-task macro accuracy (%)")
    ax_end.set_title("(a) Hard handoff is safe, not additive")
    ax_end.grid(True, color="#E7E7E7", linewidth=0.7)
    ax_end.set_axisbelow(True)
    ax_end.legend(loc="lower left", frameon=False)

    epoch1 = [
        (0.9635367, 67.65625),
        (1.9270734, 68.046875),
        (3.8541469, 70.859375),
        (7.7082930, 67.109375),
    ]
    epoch2 = [
        (1.7708135, 68.125),
        (3.5416271, 68.671875),
        (7.0832535, 71.40625),
        (14.1665069, 71.640625),
    ]
    for name, points, color, marker in (
        ("epoch 1 hard path", epoch1, "#C9485B", "o"),
        ("epoch 2 hard path", epoch2, "#7B5AB5", "s"),
    ):
        xs, ys = zip(*points)
        ax_path.plot(xs, ys, color=color, linewidth=1.2, alpha=0.9)
        ax_path.scatter(xs, ys, color=color, marker=marker, s=34, label=name, zorder=3)

    ax_path.axhline(76.328125, color="#2C8C6B", linestyle="--", linewidth=1.1,
                    label="scale baseline (76.33%)")
    ax_path.axvline(5.0, color="#888888", linestyle=":", linewidth=0.9,
                    label="pre-registered 5% rate limit")
    ax_path.text(
        0.35,
        75.4,
        "98.20% of vectors have a\nnegative first-order neighbor,\nyet 0/8 hard sets improve",
        fontsize=7.4,
        va="top",
        bbox={"boxstyle": "round,pad=0.25", "facecolor": "white", "edgecolor": "#BBBBBB"},
    )
    ax_path.set_xlabel("Assignment switch rate (%)")
    ax_path.set_ylabel("Validation macro accuracy (%)")
    ax_path.set_title("(b) First-order promise fails after projection")
    ax_path.set_xlim(0, 15)
    ax_path.set_ylim(66.3, 77.0)
    ax_path.grid(True, color="#E7E7E7", linewidth=0.7)
    ax_path.set_axisbelow(True)
    ax_path.legend(loc="lower right", frameon=False)

    fig.tight_layout(w_pad=1.7)
    OUTPUT_PDF.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUTPUT_PDF, bbox_inches="tight")
    fig.savefig(OUTPUT_PNG, dpi=240, bbox_inches="tight")
    plt.close(fig)


if __name__ == "__main__":
    main()
