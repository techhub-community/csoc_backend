from django.db import models


class Program(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField()
    def __str__(self):
        return self.description

    class Meta:
        ordering = ["description"]
