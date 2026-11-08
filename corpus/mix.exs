defmodule Corpus.MixProject do
  use Mix.Project

  # Each design's elixir/ directory is both a source and a test root, so a new design needs no edit.
  @designs Path.wildcard("*/elixir")

  def project do
    [
      app: :corpus,
      version: "0.0.0",
      elixir: "~> 1.19",
      elixirc_paths: ["elixir_support" | @designs],
      elixirc_options: [warnings_as_errors: true],
      test_paths: @designs,
      # main at d2749c7 is MIT; the Hex 0.2.x releases are BUSL-1.1.
      deps: [
        {:temporal_sdk,
         git: "https://github.com/andrzej-mag/temporal_sdk.git",
         ref: "d2749c77a74032f466345f476861a59180086fbd"}
      ],
      # The tests configure the SDK's cluster before starting it (Corpus.Temporal.start/0).
      aliases: [test: "test --no-start"]
    ]
  end

  def application, do: [extra_applications: [:logger]]
end
