namespace eln.Backend.Application.Model;

public class Template
{
    #pragma warning disable CS8618
    protected Template() { }
    #pragma warning restore CS8618

    public Template(string name, string schema)
    {
        Name = name;
        Schema = schema;
    }

    public int Id { get; set; }
    public string Name { get; set; }
    public string Schema { get; set; } // JSONB wird im Context konfiguriert

    // Navigation Properties
    public List<Measurement> Measurements { get; set; } = new();
}
