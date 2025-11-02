using System;

namespace eln.Backend.Application.Model;

public class Animal
{
    #pragma warning disable CS8618
    protected Animal() { }
    #pragma warning restore CS8618

    public Animal(string species, string name, int createdBy)
    {
        Species = species;
        Name = name;
        CreatedBy = createdBy;
        CreatedAt = DateTime.UtcNow;
    }

    public int Id { get; set; }
    public string Species { get; set; }
    public string Name { get; set; }
    public int CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; }

    // Navigation Properties
    public User? Creator { get; set; }
    public List<Lung> Lungs { get; set; } = new();
}
