import "./ui.css";

type EmptyStateProps = {
  description: string;
  title: string;
};

export function EmptyState({ description, title }: EmptyStateProps) {
  return (
    <section aria-label={title} className="empty" role="status">
      <h2 className="empty__title">{title}</h2>
      <p className="empty__description">{description}</p>
    </section>
  );
}
