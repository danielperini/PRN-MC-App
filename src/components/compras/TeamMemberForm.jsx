    </Dialog>
  );
}

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-black border-b pb-1.5">{title}</h3>
      {children}
    </div>
  );
}
