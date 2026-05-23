namespace FirstDraft.Commands
{
  public sealed record CommandLineOutputChunk(long Sequence, string Stream, string Text, DateTime EmittedAt);
}
